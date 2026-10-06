import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { leadPayload, metaCookies, sendLead, sha256, type LeadContext } from "./meta.mts";
import { META_PIXEL_ID } from "./pixel.mts";

const ctx: LeadContext = {
  time: 1790000000,
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 test",
  url: "https://prompts.creativesystemslab.com/",
  fbp: "fb.1.1790000000000.123",
  fbc: "fb.1.1790000000000.AbCdEf",
};
const lead = { email: "  Tess@Example.com ", firstName: "Tess", route: "s4" };
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).Netlify;
});

function env(vars: Record<string, string>) {
  (globalThis as any).Netlify = { env: { get: (k: string) => vars[k] } };
}

test("email and name are trimmed, lowercased and SHA-256 hashed", () => {
  assert.equal(sha256("  Tess@Example.com "), sha256("tess@example.com"));
  assert.match(sha256("x"), /^[0-9a-f]{64}$/);
});

test("reads _fbp and _fbc from the cookie header", () => {
  assert.deepEqual(metaCookies("a=1; _fbp=fb.1.2.3; _fbc=fb.1.2.Ab=c"), { fbp: "fb.1.2.3", fbc: "fb.1.2.Ab=c" });
  assert.deepEqual(metaCookies(null), {});
});

test("the Lead payload dedupes with the browser event and carries no plain-text PII", () => {
  const body = leadPayload("job-123", lead, ctx);
  const e = body.data[0];
  assert.equal(e.event_name, "Lead");
  assert.equal(e.event_id, "job-123");
  assert.equal(e.action_source, "website");
  assert.deepEqual((e.user_data as any).em, [sha256("tess@example.com")]);
  assert.equal((e.user_data as any).fbc, ctx.fbc);
  assert.ok(!JSON.stringify(body).toLowerCase().includes("tess@example.com"));
  assert.equal("test_event_code" in body, false);
  assert.equal(leadPayload("j", lead, ctx, "TEST123").test_event_code, "TEST123");
});

test("nothing is sent without META_CAPI_TOKEN", async () => {
  env({});
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
  const out = await sendLead("job-1", lead, ctx);
  assert.equal(out.skipped, true);
  assert.equal(called, false);
});

test("with a token it posts to the pixel's events endpoint and never throws", async () => {
  env({ META_CAPI_TOKEN: "secret-token" });
  let url = "";
  globalThis.fetch = (async (u: string) => { url = String(u); return new Response('{"events_received":1}'); }) as typeof fetch;
  const ok = await sendLead("job-1", lead, ctx);
  assert.equal(ok.ok, true);
  assert.ok(url.includes(`/${META_PIXEL_ID}/events?access_token=secret-token`));

  globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
  const bad = await sendLead("job-1", lead, ctx);
  assert.equal(bad.ok, false);
  assert.match(bad.detail ?? "", /network down/);
});
