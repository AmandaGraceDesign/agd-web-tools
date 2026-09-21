import type { Config, Context } from "@netlify/functions";
import { jobStore, type JobRecord } from "../lib/store.mts";
import type { Generated, GeneratedPrompt } from "../lib/claude.mts";

/**
 * A permanent, shareable page for one person's prompts.
 *
 * The tool shows results on screen, but the welcome email promises a copy -
 * and the only honest way to keep that promise is to send a link to THEIR
 * prompts. The job id is already an unguessable UUID, so it doubles as the
 * address, and the subscriber's Kit `prompts_url` field points here.
 *
 * It is written before the generation finishes, so it also has to render the
 * still-working and failed states.
 */

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLES = `
  :root{--gold:#eeac55;--navy:#204568;--blush:#f7ede6;--coral:#e85c66;
        --ink:#1b2c3d;--muted:#5c6f80;--line:#e3d6cc;--card:#fffdfb}
  *{box-sizing:border-box}
  body{margin:0;background:var(--blush);color:var(--ink);font-size:17px;line-height:1.6;
       font-family:"Avenir Next","Segoe UI",system-ui,-apple-system,sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:0 20px}
  header{background:var(--navy);color:#fff;padding:14px 0}
  header .wrap{display:flex;align-items:center;gap:10px;font-size:14px;
               letter-spacing:.08em;text-transform:uppercase}
  header .dot{width:9px;height:9px;border-radius:50%;background:var(--gold)}
  h1{font-size:clamp(28px,5vw,40px);line-height:1.15;margin:34px 0 14px;letter-spacing:-.02em}
  .lede{font-size:19px;color:var(--muted);margin:0 0 28px}
  .prompt{background:var(--card);border:1px solid var(--line);border-radius:14px;
          padding:22px;margin:0 0 16px}
  .num{display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;
       font-size:13px;padding:3px 10px;border-radius:999px;margin:0 0 8px;letter-spacing:.04em}
  h3{margin:0 0 6px;font-size:19px;letter-spacing:-.01em}
  .why{color:var(--muted);font-size:15.5px;margin:0 0 14px}
  pre{background:#fbf6f1;border:1px solid var(--line);border-radius:10px;padding:15px;
      white-space:pre-wrap;word-wrap:break-word;font-size:14.5px;line-height:1.55;margin:0;
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .tip{font-size:14.5px;color:var(--muted);margin:10px 0 0;padding-left:10px;
       border-left:2px solid var(--gold)}
  .cta{background:var(--navy);color:#fff;border-radius:14px;padding:28px;margin:26px 0}
  .cta h2{color:#fff;margin:0 0 6px;font-size:22px}
  .cta p{color:#cfdcea;margin:0 0 16px}
  .cta a{display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;
         text-decoration:none;padding:13px 26px;border-radius:999px}
  .note{background:#fff;border-left:4px solid var(--gold);padding:16px;border-radius:0 10px 10px 0}
  footer{color:var(--muted);font-size:14px;padding:30px 0 50px;text-align:center}
  footer a{color:var(--navy)}
  @media (max-width:520px){.prompt,.cta{padding:18px}body{font-size:16px}}
`;

function page(title: string, body: string, refresh = false): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escape(title)}</title>${refresh ? '<meta http-equiv="refresh" content="8">' : ""}
<style>${STYLES}</style></head><body>
<header><div class="wrap"><span class="dot"></span><span>Creative Systems Lab</span></div></header>
<main class="wrap">${body}</main>
<footer class="wrap"><p>Built by <a href="https://amandagracedesign.com">Amanda Grace Design</a></p></footer>
</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

const CTA = `<div class="cta">
  <h2>Want to build the system, not just run the prompt?</h2>
  <p>Creative Systems Lab is a monthly 90-minute live build. You walk away with
     something built &mdash; not just something learned. Sessions 1 and 2 are free.</p>
  <a href="https://creativesystemslab.com">See the next session</a>
</div>`;

function renderPrompt(p: GeneratedPrompt, i: number): string {
  return `<div class="prompt">
    <span class="num">PROMPT ${i + 1}</span>
    <h3>${escape(p.title || `Prompt ${i + 1}`)}</h3>
    ${p.why ? `<p class="why">${escape(p.why)}</p>` : ""}
    <pre>${escape(p.prompt || "")}</pre>
    ${p.tip ? `<p class="tip">${escape(p.tip)}</p>` : ""}
  </div>`;
}

export default async (req: Request, _context: Context) => {
  const jobId = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  const job = jobId ? ((await jobStore().get(jobId, { type: "json" })) as JobRecord | null) : null;

  if (!job) {
    return page(
      "Prompts not found",
      `<h1>I can't find those.</h1>
       <p class="lede">That link doesn't match anything. It may have been mistyped.</p>
       <p><a href="/">Start again &rarr;</a></p>`,
    );
  }

  const name = job.first_name ? escape(job.first_name) : "";

  if (job.status === "pending" || job.status === "running") {
    return page(
      "Your prompts are being written",
      `<h1>Still writing${name ? `, ${name}` : ""}.</h1>
       <p class="lede">These take a minute because they aren't a template.
          This page refreshes itself &mdash; leave it open, or come back to it later.</p>`,
      true,
    );
  }

  if (job.status === "error" || !job.result) {
    return page(
      "That one didn't finish",
      `<h1>That one didn't finish.</h1>
       <div class="note">Something broke on my end while writing these, so there's nothing
       to show here. Running it again takes a minute and usually works.</div>
       <p style="margin-top:22px"><a href="/">Run it again &rarr;</a></p>`,
    );
  }

  const result = job.result as Generated;
  const prompts = Array.isArray(result.prompts) ? result.prompts : [];

  return page(
    "Your ten AI prompts",
    `<h1>${name ? `Your prompts, ${name}.` : "Your ten prompts."}</h1>
     <p class="lede">${escape(
       result.summary ||
         "Ten prompts written around your business. Copy one, paste it into Claude, change what you want.",
     )}</p>
     ${prompts.map(renderPrompt).join("")}
     ${CTA}`,
  );
};

export const config: Config = {
  path: "/r/:jobId",
};
