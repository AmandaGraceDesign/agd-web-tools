import assert from "node:assert/strict";
import test from "node:test";
import { LIMITS, parseIntake } from "./validate.mts";

const good = {
  business: "I design surface patterns and license them to fabric brands.",
  audience: "Art directors at home goods brands",
  channels: ["Etsy", "Instagram"],
  stage: "Selling some — inconsistent income",
  timesink: "Writing product listings for every new pattern.",
  next30: "Launching a holiday collection",
  first_name: "Mandy",
  email: "Mandy@Example.COM",
};

test("accepts a complete intake and lowercases the email", () => {
  const r = parseIntake(good);
  assert.ok(r.ok);
  assert.equal(r.value.email, "mandy@example.com");
  assert.equal(r.value.firstName, "Mandy");
  assert.deepEqual(r.value.channels, ["Etsy", "Instagram"]);
});

test("rejects a filled honeypot", () => {
  const r = parseIntake({ ...good, website: "http://spam.example" });
  assert.equal(r.ok, false);
});

test("rejects a too-short business description", () => {
  const r = parseIntake({ ...good, business: "patterns" });
  assert.equal(r.ok, false);
});

test("rejects a missing time sink", () => {
  const r = parseIntake({ ...good, timesink: "busy" });
  assert.equal(r.ok, false);
});

test("rejects a bad email", () => {
  for (const email of ["nope", "a@b", "a b@c.com", ""]) {
    assert.equal(parseIntake({ ...good, email }).ok, false, `should reject ${email}`);
  }
});

test("strips control characters from free text", () => {
  const r = parseIntake({ ...good, business: `I sell\u0000 digital\u001B papers for Cricut users.` });
  assert.ok(r.ok);
  assert.equal(r.value.business.includes("\u0000"), false);
  assert.equal(r.value.business.includes("\u001B"), false);
});

test("clamps oversized fields to the documented caps", () => {
  const r = parseIntake({ ...good, business: "x".repeat(5000) });
  assert.ok(r.ok);
  assert.equal(r.value.business.length, LIMITS.business);
});

test("caps the number of channels and ignores non-strings", () => {
  const r = parseIntake({ ...good, channels: [...Array(50).fill("Etsy"), 42, null] });
  assert.ok(r.ok);
  assert.ok(r.value.channels.length <= LIMITS.channels);
});

test("tolerates missing optional fields", () => {
  const r = parseIntake({
    business: good.business,
    timesink: good.timesink,
    first_name: "Jo",
    email: "jo@example.com",
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.channels, []);
  assert.equal(r.value.next30, "");
});

test("rejects non-objects", () => {
  for (const bad of [null, undefined, "string", 42]) {
    assert.equal(parseIntake(bad).ok, false);
  }
});
