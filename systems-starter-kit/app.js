/* Systems Starter Kit — front end.
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

$("intake").addEventListener("submit", (e) => {
  e.preventDefault();
  clearFail("intake-err");

  const business = $("business").value.trim();
  const timesink = $("timesink").value.trim();

  if (business.length < 15) {
    return fail(
      "intake-err",
      "Give me a sentence or two about what you make and sell — I can't write prompts around three words.",
    );
  }
  if (timesink.length < 10) {
    return fail("intake-err", "Tell me what eats your time. That answer shapes half of these prompts.");
  }

  profile = {
    business,
    audience: $("audience").value.trim(),
    channels: checkedValues("channels"),
    stage: checkedValues("stage")[0] || "",
    timesink,
    next30: $("next30").value.trim(),
    website: $("website").value, // honeypot — must stay empty
  };

  show("email");
  $("first_name").focus();
});

$("back-btn").addEventListener("click", () => show("intake"));

// --- Step 2: email gate, then start + poll -------------------------------

const LOADING_MESSAGES = [
  "Reading what you told me about your business…",
  "Working out where your week actually leaks…",
  "Writing prompts around your bottleneck, not a generic list…",
  "Checking each one would survive contact with a real Tuesday…",
  "Almost there — this part takes a minute because it isn't a template…",
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
  return data.job_id;
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

  let i = 0;
  const ticker = setInterval(() => {
    i = (i + 1) % LOADING_MESSAGES.length;
    $("loading-msg").textContent = LOADING_MESSAGES[i];
  }, 6000);

  try {
    const jobId = await startJob({ ...profile, first_name, email });
    const data = await pollJob(jobId);
    generated = data;
    render(data, first_name);
    show("results");
  } catch (err) {
    show("email");
    fail("gate-err", err.message || "Something broke on my end. Try again in a minute.");
  } finally {
    clearInterval(ticker);
    $("gate-btn").disabled = false;
  }
});

// --- Step 3: render -------------------------------------------------------

function render(data, firstName) {
  $("results-title").textContent = firstName ? `Here they are, ${firstName}.` : "Your ten prompts.";
  $("results-lede").textContent =
    data.summary || "Ten prompts written around your business. Copy one, paste it into Claude, change what you want.";

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
  const lines = ["TEN AI PROMPTS FOR YOUR BUSINESS", "Creative Systems Lab — Amanda Grace Design", ""];
  if (generated && generated.summary) lines.push(generated.summary, "");
  (generated?.prompts || []).forEach((p, i) => {
    lines.push("=".repeat(60));
    lines.push(`${i + 1}. ${p.title || ""}`);
    lines.push("=".repeat(60), "");
    if (p.why) lines.push(`WHY THIS ONE: ${p.why}`, "");
    lines.push("PROMPT:", p.prompt || "", "");
    if (p.tip) lines.push(`TIP: ${p.tip}`, "");
  });
  lines.push("", "Build the system, not just the prompt: https://creativesystemslab.com");
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
