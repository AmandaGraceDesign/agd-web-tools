import { BOTTLENECKS, CLAUDE_LEVELS, SELLS, makesLabel, type Intake } from "./validate.mts";
import type { Recommendation } from "./routing.mts";

const KIT_API = "https://api.kit.com/v4";

/**
 * Form 9454523 = "CSL - 10 AI Prompts Freebie", the live destination of the
 * Instagram SYSTEMS trigger (500+ subscribers, still taking daily signups).
 *
 * NOT 9374679 - that is "CSL Positioning Interview". An earlier handoff doc
 * named 9374679 by mistake.
 */
const DEFAULT_FORM_ID = "9454523";

/** Everyone who comes through the tool, so tool signups can be told apart from PDF signups. */
const TOOL_TAG = 24303767; // "CSL Prompt Generator"

/**
 * One tag per route, created 2026-10-05, so a Kit automation can fire on the
 * route. The route key comes from routing.mts; "s1-then-*" all share S1.
 */
const ROUTE_TAGS: Record<string, number> = {
  s1: 24303768, // CSL PG Route - S1 New to Claude
  s3: 24303769, // CSL PG Route - S3 Lead Magnet
  s4: 24303770, // CSL PG Route - S4 Offer
  s5: 24303771, // CSL PG Route - S5 SEO
  s6: 24303772, // CSL PG Route - S6 Content
  s7: 24303773, // CSL PG Route - S7 Admin
  s9: 24303774, // CSL PG Route - S9 Collection
  s10: 24303775, // CSL PG Route - S10 Skills
};

export function routeTagId(routeKey: string): number | undefined {
  return ROUTE_TAGS[routeKey.startsWith("s1-then-") ? "s1" : routeKey];
}

export interface SubscribeOutcome {
  ok: boolean;
  status?: number;
  detail?: string;
}

async function post(path: string, apiKey: string, body: unknown): Promise<SubscribeOutcome> {
  try {
    const res = await fetch(`${KIT_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kit-Api-Key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail: `${path}: ${detail.slice(0, 300)}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, detail: `${path}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Create (or update) the subscriber with every answer as a custom field, add
 * them to the form, then tag them with the tool tag and their route tag.
 *
 * Deliberately never throws: a Kit outage should not cost the visitor the
 * prompts they just filled in a form to get. The caller logs the outcome.
 */
export async function subscribe(
  intake: Intake,
  rec: Recommendation,
  promptsUrl?: string,
): Promise<SubscribeOutcome> {
  const apiKey = Netlify.env.get("KIT_API_KEY");
  if (!apiKey) {
    return { ok: false, detail: "KIT_API_KEY not set" };
  }
  const formId = Netlify.env.get("KIT_FORM_ID") || DEFAULT_FORM_ID;

  const fields: Record<string, string> = {
    pg_makes: makesLabel(intake),
    pg_sells: intake.sells.map((s) => SELLS[s]).join(", "),
    pg_bottleneck: BOTTLENECKS[intake.bottleneck],
    pg_claude_level: CLAUDE_LEVELS[intake.claude],
    pg_goal: intake.goal,
    pg_route: rec.key,
  };
  // The welcome email links here, so it delivers THEIR prompts rather than a
  // generic download.
  if (promptsUrl) fields.prompts_url = promptsUrl;

  // Kit v4 only adds an EXISTING subscriber to a form or tag, so create them
  // first. POST /subscribers is an upsert by email and also writes the fields.
  // (v1 called the form endpoint first, which 404s for anyone new to the list.)
  const upsert = await post("/subscribers", apiKey, {
    email_address: intake.email,
    first_name: intake.firstName,
    fields,
  });
  if (!upsert.ok) return upsert;

  // The form add is what fires the form's own incentive/welcome email.
  const form = await post(`/forms/${formId}/subscribers`, apiKey, {
    email_address: intake.email,
  });

  const tags = [TOOL_TAG, routeTagId(rec.key)].filter((t): t is number => !!t);
  const tagged = await Promise.all(
    tags.map((id) => post(`/tags/${id}/subscribers`, apiKey, { email_address: intake.email })),
  );

  const failed = [form, ...tagged].filter((r) => !r.ok);
  return failed.length
    ? { ok: false, status: failed[0].status, detail: failed.map((f) => f.detail).join(" | ") }
    : { ok: true, status: form.status };
}
