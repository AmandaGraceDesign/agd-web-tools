import type { Intake } from "./validate.mts";

const KIT_API = "https://api.kit.com/v4";

/**
 * Form 9454523 = "CSL - 10 AI Prompts Freebie", the live destination of the
 * Instagram SYSTEMS trigger (501 subscribers, still taking daily signups).
 *
 * NOT 9374679 - that is "CSL Positioning Interview" (30 subscribers, none
 * since 2026-05-08). An earlier handoff doc named 9374679 by mistake.
 */
const DEFAULT_FORM_ID = "9454523";

export interface SubscribeOutcome {
  ok: boolean;
  status?: number;
  detail?: string;
}

/**
 * Add the visitor to the Kit form, carrying the link to their own results.
 *
 * Deliberately never throws: a Kit outage should not cost the visitor the
 * prompts they just filled in a form to get. The caller logs the outcome.
 */
export async function subscribe(
  intake: Intake,
  promptsUrl?: string,
): Promise<SubscribeOutcome> {
  const apiKey = Netlify.env.get("KIT_API_KEY");
  if (!apiKey) {
    return { ok: false, detail: "KIT_API_KEY not set" };
  }
  const formId = Netlify.env.get("KIT_FORM_ID") || DEFAULT_FORM_ID;

  try {
    const res = await fetch(`${KIT_API}/forms/${formId}/subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Kit-Api-Key": apiKey,
      },
      body: JSON.stringify({
        email_address: intake.email,
        first_name: intake.firstName,
        // The welcome email links here, so it delivers THEIR prompts rather
        // than a generic download.
        ...(promptsUrl ? { fields: { prompts_url: promptsUrl } } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail: detail.slice(0, 300) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
