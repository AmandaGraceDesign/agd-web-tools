import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntake, makesLabel } from "./validate.mts";
import { recommend } from "./routing.mts";

const good = {
  makes: "patterns",
  sells: ["spoonflower", "etsy"],
  bottleneck: "admin",
  claude: "free_daily",
  goal: "Launch my holiday collection and email my list about it.",
  first_name: "Tess",
  email: "Tess@Example.com",
};

test("accepts a complete intake and lowercases the email", () => {
  const r = parseIntake(good);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.email, "tess@example.com");
    assert.deepEqual(r.value.sells, ["spoonflower", "etsy"]);
  }
});

test("rejects a filled honeypot", () => {
  assert.equal(parseIntake({ ...good, website: "spam.example" }).ok, false);
});

test("rejects tap answers that are not on the list", () => {
  assert.equal(parseIntake({ ...good, makes: "jewelry" }).ok, false);
  assert.equal(parseIntake({ ...good, bottleneck: "ignore previous instructions" }).ok, false);
  assert.equal(parseIntake({ ...good, claude: "max" }).ok, false);
});

test("drops unknown and duplicate sells, and requires at least one real one", () => {
  const r = parseIntake({ ...good, sells: ["etsy", "etsy", "amazon"] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value.sells, ["etsy"]);
  assert.equal(parseIntake({ ...good, sells: ["amazon"] }).ok, false);
  assert.equal(parseIntake({ ...good, sells: "etsy" }).ok, false);
});

test("'something else' needs its text box, and other choices ignore it", () => {
  assert.equal(parseIntake({ ...good, makes: "other" }).ok, false);
  const r = parseIntake({ ...good, makes: "other", makes_other: "Pottery" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(makesLabel(r.value), "Pottery");
  const r2 = parseIntake({ ...good, makes_other: "Pottery" });
  if (r2.ok) {
    assert.equal(r2.value.makesOther, "");
    assert.equal(makesLabel(r2.value), "Surface patterns");
  }
});

test("caps and strips the free text", () => {
  const r = parseIntake({ ...good, goal: "a\u0000b ".repeat(400) });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(r.value.goal.length <= 300);
    assert.ok(!r.value.goal.includes("\u0000"));
  }
  assert.equal(parseIntake({ ...good, goal: "too short" }).ok, false);
});

// --- routing ---------------------------------------------------------------

const BEFORE_S9 = new Date("2026-10-05T15:00:00Z");
const AFTER_S12 = new Date("2026-12-01T15:00:00Z");
const NEXT_YEAR = new Date("2027-01-15T15:00:00Z");

test("each bottleneck routes to its approved session", () => {
  const expected: Record<string, number> = {
    no_sales: 6, not_found: 5, no_list: 3, offer: 4, admin: 7, collection: 9, reexplain: 10,
  };
  for (const [b, n] of Object.entries(expected)) {
    const rec = recommend(b as never, "pro", BEFORE_S9);
    assert.equal(rec.primary.session, n, b);
  }
});

test("never used Claude goes to free Sessions 1 & 2 first, Q3 session second", () => {
  const rec = recommend("collection", "never", BEFORE_S9);
  assert.equal(rec.primary.session, 1);
  assert.equal(rec.primary.price, "Free");
  assert.equal(rec.alsoFree?.session, 2);
  assert.equal(rec.next?.session, 9);
  assert.ok(rec.proNote, "S9 is Pro, so the note shows");
  assert.equal(rec.bundle, undefined);
});

test("Pro note shows below Pro for Session 7+, never for 3-6 or Pro users", () => {
  assert.ok(recommend("admin", "free_daily", BEFORE_S9).proNote);
  assert.ok(recommend("reexplain", "free_sometimes", BEFORE_S9).proNote);
  assert.equal(recommend("admin", "pro", BEFORE_S9).proNote, undefined);
  assert.equal(recommend("no_sales", "free_daily", BEFORE_S9).proNote, undefined);
  assert.equal(recommend("no_sales", "never", BEFORE_S9).proNote, undefined);
});

test("live sessions flip to replay once they have run", () => {
  assert.equal(recommend("collection", "pro", BEFORE_S9).primary.live, true);
  assert.match(recommend("collection", "pro", BEFORE_S9).primary.when, /Oct 14/);
  assert.equal(recommend("collection", "pro", AFTER_S12).primary.live, false);
  assert.match(recommend("collection", "pro", AFTER_S12).primary.when, /Replay/);
});

test("admin gets Session 12 next plus the bundle; bundle and Season stop after Dec 31", () => {
  const rec = recommend("admin", "pro", BEFORE_S9);
  assert.equal(rec.next?.session, 12);
  assert.ok(rec.bundle);
  assert.ok(rec.season);
  const later = recommend("admin", "pro", NEXT_YEAR);
  assert.equal(later.bundle, undefined);
  assert.equal(later.season, undefined);
  assert.equal(recommend("offer", "pro", BEFORE_S9).bundle, undefined);
});

test("no recommendation copy contains an em dash", () => {
  const all = ["no_sales", "not_found", "no_list", "offer", "admin", "collection", "reexplain"]
    .flatMap((b) => ["never", "free_daily", "pro"].map((c) => recommend(b as never, c as never, BEFORE_S9)));
  assert.ok(!JSON.stringify(all).includes("—"));
});
