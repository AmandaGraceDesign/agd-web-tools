import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildUserMessage } from "./claude.mts";
import { parseIntake, type Intake } from "./validate.mts";

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

test("the business name reaches the model inside the data markers", () => {
  const msg = buildUserMessage(intake({ business_name: "Blue Fern Studio" }));
  const begin = msg.indexOf("--- BEGIN");
  const end = msg.indexOf("--- END");
  const at = msg.indexOf("Business name: Blue Fern Studio");
  assert.ok(at > begin && at < end);
});

test("no business name tells the model to fall back to 'your business'", () => {
  assert.match(buildUserMessage(intake()), /Business name: \(not given; say "your business"\)/);
});

test("the buyer reaches the model as who the prompts are written for", () => {
  const msg = buildUserMessage(intake({ buyer: "quilters who buy fabric by the yard" }));
  assert.match(msg, /Who buys from them, in their words: quilters who buy fabric by the yard/);
  assert.ok(msg.indexOf("quilters") < msg.indexOf("--- END"));
  assert.match(buildUserMessage(intake()), /Who buys from them, in their words: \(not given;/);
});

test("the page never says ICA", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\bICA\b/);
  assert.doesNotMatch(js, /\bICA\b/);
});

test("the page has both optional boxes with the right caps and placeholders", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(html, /id="business_name"[^>]*maxlength="80"[^>]*placeholder="Like: Blue Fern Studio"/);
  assert.match(html, /id="buyer"[^>]*maxlength="200"[^>]*placeholder="Like: quilters who buy fabric by the yard"/);
  // Business name sits under question 1; "Who buys" comes right after "Where do you sell it?".
  const q1 = html.indexOf("What do you make?");
  const name = html.indexOf('id="business_name"');
  const sell = html.indexOf("Where do you sell it?");
  const buyer = html.indexOf("Who buys from you?");
  const eating = html.indexOf("What's eating your week");
  assert.ok(q1 < name && name < sell && sell < buyer && buyer < eating);
});
