/* Systems Starter Kit, front end (v2: six-question diagnostic + CSL routing).
 * Three steps: intake -> email gate -> results.
 *
 * Generation runs in a Netlify background function (a synchronous one would
 * time out), so the flow is: POST /api/start to get a job id, then poll
 * /api/result until it reports done.
 *
 * Everything the model returns is inserted with textContent, never innerHTML. */

const $ = (id) => document.getElementById(id);
const steps = {
  intake: $("step-intake"),
  email: $("step-email"),
  loading: $("step-loading"),
  results: $("step-results"),
};

const POLL_EVERY_MS = 2500;
const GIVE_UP_AFTER_MS = 5 * 60 * 1000;

let profile = null;
let generated = null;

function show(name) {
  Object.values(steps).forEach((s) => s.classList.add("hidden"));
  steps[name].classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fail(elId, msg) {
  const el = $(elId);
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearFail(elId) {
  $(elId).classList.add("hidden");
}

function checkedValues(containerId) {
  return Array.from($(containerId).querySelectorAll("input:checked")).map((i) => i.value);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Step 1: intake -------------------------------------------------------

function picked(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : "";
}

// "Something else" opens a short text box.
$("makes").addEventListener("change", () => {
  const other = checkedValues("makes").includes("other");
  $("makes_other").classList.toggle("hidden", !other);
  if (other) $("makes_other").focus();
});

$("intake").addEventListener("submit", (e) => {
  e.preventDefault();
  clearFail("intake-err");

  const makes = checkedValues("makes");
  const makes_other = $("makes_other").value.trim();
  const business_name = $("business_name").value.trim();
  const sells = checkedValues("sells");
  const buyer = $("buyer").value.trim();
  const bottleneck = picked("bottleneck");
  const claude = picked("claude");
  const goal = $("goal").value.trim();

  if (!makes.length) return fail("intake-err", "Tap what you make (question 1).");
  if (makes.includes("other") && makes_other.length < 3) {
    return fail("intake-err", "Tell me in a few words what else you make.");
  }
  if (!sells.length) return fail("intake-err", "Tap at least one place you sell (question 2). Not selling yet counts.");
  if (!bottleneck) return fail("intake-err", "Tap what's eating your week (question 4).");
  if (!claude) return fail("intake-err", "Tap where you are with Claude (question 5).");
  if (goal.length < 10) {
    return fail("intake-err", "Give me one sentence on what you want done in the next 90 days (question 6).");
  }

  profile = {
    makes,
    makes_other,
    business_name,
    sells,
    buyer,
    bottleneck,
    claude,
    goal,
    website: $("website").value, // honeypot, must stay empty
  };

  show("email");
  $("first_name").focus();
});

$("back-btn").addEventListener("click", () => show("intake"));

// --- Step 2: email gate, then start + poll -------------------------------

// Ten tiles, one per prompt. Generation is a single call, so there is no real
// per-prompt progress to report: the tiles ease toward 9 of 10 over a couple
// of minutes and only the tenth lands when the prompts actually arrive.
let tileTimer = null;

function startTiles() {
  const tiles = Array.from($("tiles").children);
  const began = Date.now();
  const paint = () => {
    const secs = (Date.now() - began) / 1000;
    const filled = Math.min(9, Math.floor(9 * (1 - Math.exp(-secs / 30))) + 1);
    tiles.forEach((t, i) => {
      t.classList.toggle("on", i < filled);
      t.classList.toggle("next", i === filled);
    });
  };
  paint();
  tileTimer = setInterval(paint, 500);
}

function finishTiles() {
  clearInterval(tileTimer);
  Array.from($("tiles").children).forEach((t) => {
    t.classList.add("on");
    t.classList.remove("next");
  });
}

function stopTiles() {
  clearInterval(tileTimer);
}

const LOADING_MESSAGES = [
  "Reading what you told me about your business…",
  "Working out where your week actually leaks…",
  "Writing prompts around your bottleneck, not a generic list…",
  "Checking each one would survive contact with a real Tuesday…",
  "Almost there. This part takes a minute because it isn't a template…",
];

async function startJob(payload) {
  const res = await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.job_id) {
    throw new Error(data.error || "Something broke on my end. Try again in a minute.");
  }
  return data;
}

async function pollJob(jobId) {
  const deadline = Date.now() + GIVE_UP_AFTER_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_EVERY_MS);

    let res;
    try {
      res = await fetch(`/api/result?job=${encodeURIComponent(jobId)}`);
    } catch {
      continue; // a dropped poll is not a failed job — try the next one
    }

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.status === "done") return data;
    if (data.status === "error") {
      const base = data.error || "Something broke on my end. Try again in a minute.";
      throw new Error(data.detail ? `${base}\n\n[${data.detail}]` : base);
    }
    if (res.status === 404) {
      throw new Error("I lost track of that one. Start over?");
    }
  }

  throw new Error("That took longer than it should have. Try again?");
}

$("gate").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFail("gate-err");

  const first_name = $("first_name").value.trim();
  const email = $("email").value.trim();

  if (!first_name) return fail("gate-err", "First name, please.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return fail("gate-err", "That email doesn't look right. Check it once more?");
  }

  $("gate-btn").disabled = true;
  show("loading");

  $("rec-loading").textContent = "";
  $("rec-wait").classList.add("hidden");
  startTiles();

  let i = 0;
  const ticker = setInterval(() => {
    i = (i + 1) % LOADING_MESSAGES.length;
    $("loading-msg").textContent = LOADING_MESSAGES[i];
  }, 6000);

  try {
    const started = await startJob({ ...profile, first_name, email });
    // The recommendation is decided at intake, so show it while the prompts
    // are still being written instead of making them stare at a spinner.
    if (started.rec && started.rec.primary) {
      $("rec-loading").appendChild(recCard(started.rec, { newTab: true }));
      $("rec-wait").classList.remove("hidden");
    }
    const data = await pollJob(started.job_id);
    finishTiles();
    await sleep(400); // let the tenth tile land before the page swaps
    generated = data;
    render(data, first_name);
    show("results");
  } catch (err) {
    show("email");
    fail("gate-err", err.message || "Something broke on my end. Try again in a minute.");
  } finally {
    stopTiles();
    clearInterval(ticker);
    $("gate-btn").disabled = false;
  }
});

// --- Step 3: render -------------------------------------------------------

function render(data, firstName) {
  $("results-title").textContent = firstName ? `Here they are, ${firstName}.` : "Your ten prompts.";
  $("results-lede").textContent =
    data.summary || "Ten prompts written around your business. Copy one, paste it into Claude, change what you want.";

  renderRec(data.rec);

  const box = $("prompts");
  box.textContent = "";

  (data.prompts || []).forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "prompt";

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = `PROMPT ${idx + 1}`;
    card.appendChild(num);

    const h3 = document.createElement("h3");
    h3.textContent = p.title || `Prompt ${idx + 1}`;
    card.appendChild(h3);

    if (p.why) {
      const why = document.createElement("p");
      why.className = "why";
      why.textContent = p.why;
      card.appendChild(why);
    }

    const pre = document.createElement("pre");
    pre.textContent = p.prompt || "";
    card.appendChild(pre);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost";
    btn.textContent = "Copy this prompt";
    btn.addEventListener("click", () => copy(p.prompt || "", btn, "Copy this prompt"));
    card.appendChild(btn);

    if (p.tip) {
      const tip = document.createElement("p");
      tip.className = "tip";
      tip.textContent = p.tip;
      card.appendChild(tip);
    }

    box.appendChild(card);
  });
}


// --- Recommendation: where to start in CSL --------------------------------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function a(href, text, cls, newTab) {
  const n = el("a", cls, text);
  n.href = href;
  // On the loading screen a click must not navigate away from the
  // generation in progress, so links open in a new tab there.
  if (newTab) {
    n.target = "_blank";
    n.rel = "noopener";
  }
  return n;
}

function recCard(rec, opts = {}) {
  const nt = !!opts.newTab;
  const card = el("div", "rec");
  card.appendChild(el("p", "eyebrow", "Based on what you told me"));
  card.appendChild(el("h2", "", rec.headline));
  card.appendChild(el("p", "stitle", rec.primary.heading || `Session ${rec.primary.session}: ${rec.primary.title}`));
  card.appendChild(el("p", "when", `${rec.primary.when} · ${rec.primary.price}`));
  card.appendChild(el("p", "why", rec.why));
  card.appendChild(a(rec.primary.url, rec.primary.cta || `See Session ${rec.primary.session}`, "btn", nt));

  if (rec.alsoFree) {
    const p = el("p", "small");
    p.appendChild(document.createTextNode("Then "));
    p.appendChild(a(rec.alsoFree.url, `Session ${rec.alsoFree.session}: ${rec.alsoFree.title}`, "", nt));
    p.appendChild(document.createTextNode(". Also free."));
    card.appendChild(p);
  }

  if (rec.next) {
    const sub = el("div", "sub");
    sub.appendChild(el("p", "", rec.next.why));
    const p = el("p", "small");
    p.appendChild(a(rec.next.url, `Session ${rec.next.session}: ${rec.next.title}`, "", nt));
    p.appendChild(document.createTextNode(` · ${rec.next.when} · ${rec.next.price}`));
    sub.appendChild(p);
    card.appendChild(sub);
  }

  if (rec.proNote) card.appendChild(el("p", "pro", rec.proNote));

  if (rec.bundle) {
    const p = el("p", "small");
    p.appendChild(document.createTextNode(`${rec.bundle.line} `));
    p.appendChild(a(rec.bundle.url, "See the bundle", "", nt));
    card.appendChild(p);
  }
  if (rec.season) {
    const p = el("p", "small");
    p.appendChild(document.createTextNode(`${rec.season.line} `));
    p.appendChild(a(rec.season.url, "See the Season", "", nt));
    card.appendChild(p);
  }

  return card;
}

function renderRec(rec) {
  const top = $("rec");
  const bottom = $("rec-bottom");
  top.textContent = "";
  bottom.textContent = "";
  if (!rec || !rec.primary) return;

  top.appendChild(recCard(rec));

  // A short repeat under the prompts, for whoever scrolled all ten.
  const cta = el("div", "cta");
  cta.appendChild(el("h2", "", "Want to build the system, not just run the prompt?"));
  cta.appendChild(el("p", "", "Creative Systems Lab is live 90-minute Claude builds, twice a month. You walk away with something built, not just something learned."));
  cta.appendChild(a(rec.primary.url, rec.primary.cta || `Start with Session ${rec.primary.session}`));
  bottom.appendChild(cta);
}

// --- Copy / download ------------------------------------------------------

async function copy(text, btn, restoreLabel) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch { /* nothing else to try */ }
    document.body.removeChild(ta);
  }
  btn.textContent = "Copied";
  setTimeout(() => { btn.textContent = restoreLabel; }, 1800);
}

function asPlainText() {
  const lines = ["TEN AI PROMPTS FOR YOUR BUSINESS", "Creative Systems Lab | Amanda Grace Design", ""];
  if (generated && generated.summary) lines.push(generated.summary, "");
  (generated?.prompts || []).forEach((p, i) => {
    lines.push("=".repeat(60));
    lines.push(`${i + 1}. ${p.title || ""}`);
    lines.push("=".repeat(60), "");
    if (p.why) lines.push(`WHY THIS ONE: ${p.why}`, "");
    lines.push("PROMPT:", p.prompt || "", "");
    if (p.tip) lines.push(`TIP: ${p.tip}`, "");
  });
  const rec = generated && generated.rec;
  if (rec && rec.primary) {
    lines.push("=".repeat(60), "WHERE TO START", "=".repeat(60), "");
    lines.push(rec.primary.heading || `Session ${rec.primary.session}: ${rec.primary.title}`, rec.why, rec.primary.url, "");
  } else {
    lines.push("", "Build the system, not just the prompt: https://creativesystemslab.com");
  }
  return lines.join("\n");
}

$("copy-all").addEventListener("click", (e) => copy(asPlainText(), e.currentTarget, "Copy all ten"));

$("download").addEventListener("click", () => {
  const blob = new Blob([asPlainText()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ten-ai-prompts-for-your-business.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("restart").addEventListener("click", () => {
  generated = null;
  show("intake");
});
