import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("/api/start returns the recommendation with the job id", () => {
  assert.match(read("../functions/start.mts"), /json\(\{ job_id: jobId, rec \}\)/);
});

test("the loading screen has a slot for the recommendation", () => {
  const html = read("../../index.html");
  const loading = html.indexOf('id="step-loading"');
  const slot = html.indexOf('id="rec-loading"');
  const results = html.indexOf('id="step-results"');
  assert.ok(loading > -1 && loading < slot && slot < results);
});

test("links on the loading card open in a new tab, so a click can't kill the generation", () => {
  const js = read("../../app.js");
  assert.match(js, /recCard\(started\.rec, \{ newTab: true \}\)/);
  assert.match(js, /\$\("rec-loading"\)\.appendChild\(waitCard\)/);
  assert.match(js, /n\.target = "_blank";\s*n\.rel = "noopener";/);
});

test("the loading screen says it is still working, apart from the card", () => {
  const html = read("../../index.html");
  const loading = html.indexOf('id="step-loading"');
  const tiles = html.indexOf('id="tiles"');
  const stay = html.indexOf("Keep this page open");
  const label = html.indexOf("While you wait");
  const card = html.indexOf('id="rec-loading"');
  assert.ok(loading < tiles && tiles < stay && stay < label && label < card);
  assert.equal((html.slice(tiles, html.indexOf("</div>", tiles)).match(/<span><\/span>/g) || []).length, 10);
});

test("the tenth tile only lands when the prompts arrive", () => {
  const js = read("../../app.js");
  assert.match(js, /Math\.min\(9,/);
  const done = js.indexOf("const data = await pollJob(started.job_id);");
  assert.ok(done > -1 && js.indexOf("finishTiles();", done) > done);
});

import { promptsBaseUrl } from "./urls.mts";

test("emailed prompts links use the branded domain in production only", () => {
  assert.equal(promptsBaseUrl("production", "https://agd-web-tools.netlify.app"), "https://prompts.creativesystemslab.com");
  assert.equal(promptsBaseUrl("deploy-preview", "https://deploy-preview-3--agd-web-tools.netlify.app/"), "https://deploy-preview-3--agd-web-tools.netlify.app");
  assert.equal(promptsBaseUrl(undefined, undefined), "");
});

test("the pattern strip points at a file that ships with the site", () => {
  const html = read("../../index.html");
  const m = html.match(/url\((img\/[^)]+)\)/);
  assert.ok(m, "pattern strip background is set");
  assert.ok(readFileSync(new URL(`../../${m![1]}`, import.meta.url)).length > 10_000);
});

import { META_PIXEL_ID, META_PIXEL_HEAD } from "./pixel.mts";

test("the Meta pixel is on the tool page and the saved-results page, same ID", () => {
  const html = read("../../index.html");
  assert.ok(html.includes(`fbq('init','${META_PIXEL_ID}')`));
  assert.ok(html.includes("fbq('track','PageView')"));
  assert.ok(META_PIXEL_HEAD.includes(META_PIXEL_ID));
  assert.match(read("../functions/results-page.mts"), /META_PIXEL_HEAD/);
});

test("the email step fires a standard Lead event, deduplicable by job id", () => {
  assert.match(read("../../app.js"), /track\("Lead", \{[^}]*\}, \{ standard: true, eventID: started\.job_id \}\)/);
});
