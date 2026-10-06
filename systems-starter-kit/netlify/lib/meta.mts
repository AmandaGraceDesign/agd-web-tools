import { createHash } from "node:crypto";
import { META_PIXEL_ID } from "./pixel.mts";

/**
 * Meta Conversions API: the server-side copy of the browser's Lead event.
 *
 * Ad blockers and iOS privacy settings drop some browser pixel events; this
 * one is sent from Netlify, so it always arrives. Meta pairs it with the
 * browser event by event_id (the job id, also passed as the browser eventID)
 * and counts it once.
 *
 * Email and first name are SHA-256 hashed before they leave the server, as
 * Meta requires. Nothing is sent unless META_CAPI_TOKEN is set.
 */

const DEFAULT_GRAPH_VERSION = "v23.0";

/** What the browser request told us, captured in /api/start. */
export interface LeadContext {
  /** Unix seconds when the visitor submitted their email. */
  time: number;
  ip: string;
  userAgent: string;
  /** Page the visitor was on (the Referer of /api/start). */
  url: string;
  /** The pixel's _fbp cookie, if the browser has one. */
  fbp?: string;
  /** The pixel's _fbc cookie (set from an ad click's fbclid), if any. */
  fbc?: string;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Pull _fbp and _fbc out of a Cookie header. */
export function metaCookies(cookieHeader: string | null): { fbp?: string; fbc?: string } {
  const out: { fbp?: string; fbc?: string } = {};
  for (const part of (cookieHeader || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    const val = v.join("=");
    if (k === "_fbp" && val) out.fbp = val;
    if (k === "_fbc" && val) out.fbc = val;
  }
  return out;
}

export function leadPayload(
  eventId: string,
  lead: { email: string; firstName: string; route: string },
  ctx: LeadContext,
  testEventCode?: string,
) {
  const user_data: Record<string, unknown> = {
    em: [sha256(lead.email)],
    fn: [sha256(lead.firstName)],
    client_ip_address: ctx.ip,
    client_user_agent: ctx.userAgent,
  };
  if (ctx.fbp) user_data.fbp = ctx.fbp;
  if (ctx.fbc) user_data.fbc = ctx.fbc;
  return {
    data: [
      {
        event_name: "Lead",
        event_time: ctx.time,
        event_id: eventId,
        action_source: "website",
        event_source_url: ctx.url,
        user_data,
        custom_data: { content_name: "CSL Prompt Generator", route: lead.route },
      },
    ],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };
}

export interface CapiOutcome {
  ok: boolean;
  skipped?: boolean;
  detail?: string;
}

/** Never throws: a Meta outage must not cost anyone their prompts. */
export async function sendLead(
  eventId: string,
  lead: { email: string; firstName: string; route: string },
  ctx: LeadContext,
): Promise<CapiOutcome> {
  const token = Netlify.env.get("META_CAPI_TOKEN");
  if (!token) return { ok: false, skipped: true, detail: "META_CAPI_TOKEN not set" };
  const version = Netlify.env.get("META_GRAPH_VERSION") || DEFAULT_GRAPH_VERSION;
  const body = leadPayload(eventId, lead, ctx, Netlify.env.get("META_TEST_EVENT_CODE") || undefined);
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );
    const text = await res.text().catch(() => "");
    return res.ok ? { ok: true, detail: text.slice(0, 200) } : { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
