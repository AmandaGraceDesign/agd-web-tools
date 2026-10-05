import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { subscribe, staleRouteTagIds, routeTagId } from "./kit.mts";
import { parseIntake, type Intake } from "./validate.mts";
import { recommend } from "./routing.mts";

const NOW = new Date("2026-10-05T15:00:00Z");

function intake(extra: Record<string, unknown> = {}): Intake {
  const r = parseIntake({
    makes: ["patterns"],
    sells: ["etsy"],
    bottleneck: "admin",
    claude: "pro",
    goal: "Launch my holiday collection and email my list about it.",
    first_name: "Tess",
    email: "tess@example.com",
    ...extra,
  });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

interface Call { method: string; path: string; body?: any }
let calls: Call[];
let existingTags: { id: number; name: string }[];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  existingTags = [];
  (globalThis as any).Netlify = { env: { get: (k: string) => (k === "KIT_API_KEY" ? "test-key" : undefined) } };
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const path = String(url).replace("https://api.kit.com/v4", "");
    const method = init.method ?? "GET";
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const j = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (method === "POST" && path === "/subscribers") return j(201, { subscriber: { id: 777 } });
    if (method === "GET" && path.startsWith("/subscribers/777/tags")) return j(200, { tags: existingTags });
    if (method === "DELETE") return new Response(null, { status: 204 });
    return j(201, { subscriber: { id: 777 } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as any).Netlify;
});

test("business name and buyer are saved to pg_business_name and pg_buyer", async () => {
  const out = await subscribe(
    intake({ business_name: "Blue Fern Studio", buyer: "quilters who buy fabric by the yard" }),
    recommend("admin", "pro", NOW),
  );
  assert.equal(out.ok, true);
  const fields = calls.find((c) => c.path === "/subscribers")!.body.fields;
  assert.equal(fields.pg_business_name, "Blue Fern Studio");
  assert.equal(fields.pg_buyer, "quilters who buy fabric by the yard");
});

test("blank optional answers are sent empty, so a rerun clears the old value", async () => {
  await subscribe(intake(), recommend("admin", "pro", NOW));
  const fields = calls.find((c) => c.path === "/subscribers")!.body.fields;
  assert.equal(fields.pg_business_name, "");
  assert.equal(fields.pg_buyer, "");
});

test("staleRouteTagIds keeps the current route and ignores non-route tags", () => {
  const tags = [
    { id: 1, name: "CSL PG Route - S4 Offer" },
    { id: 2, name: "CSL PG Route - S7 Admin" },
    { id: 3, name: "CSL Prompt Generator" },
    { id: 4, name: "Patterns" },
    { id: 5, name: "CSL PG Route - S99 Added Later" },
  ];
  assert.deepEqual(staleRouteTagIds(tags, 2), [1, 5]);
  assert.deepEqual(staleRouteTagIds([], 2), []);
});

test("a rerun removes every other route tag before adding the current one", async () => {
  const rec = recommend("admin", "pro", NOW);
  const current = routeTagId(rec.key)!;
  existingTags = [
    { id: 24303770, name: "CSL PG Route - S4 Offer" },
    { id: 24303775, name: "CSL PG Route - S10 Skills" },
    { id: current, name: "CSL PG Route - S7 Admin" },
    { id: 24303767, name: "CSL Prompt Generator" },
  ];
  const out = await subscribe(intake(), rec);
  assert.equal(out.ok, true);

  const deletes = calls.filter((c) => c.method === "DELETE").map((c) => c.path).sort();
  assert.deepEqual(deletes, ["/tags/24303770/subscribers/777", "/tags/24303775/subscribers/777"]);

  const addRoute = calls.findIndex((c) => c.method === "POST" && c.path === `/tags/${current}/subscribers`);
  const lastDelete = Math.max(...calls.map((c, i) => (c.method === "DELETE" ? i : -1)));
  assert.ok(addRoute > lastDelete, "route tag goes on after the old ones come off");
});

test("a failed tag lookup is reported but the current route tag still goes on", async () => {
  const rec = recommend("admin", "pro", NOW);
  const current = routeTagId(rec.key)!;
  const okFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if ((init.method ?? "GET") === "GET") {
      calls.push({ method: "GET", path: String(url) });
      return new Response('{"errors":["boom"]}', { status: 500 });
    }
    return okFetch(url, init);
  }) as typeof fetch;

  const out = await subscribe(intake(), rec);
  assert.equal(out.ok, false);
  assert.match(out.detail ?? "", /GET \/subscribers\/777\/tags/);
  assert.ok(calls.some((c) => c.method === "POST" && c.path === `/tags/${current}/subscribers`));
});
