/** Input caps. These bound both abuse and the per-call token bill. */
export const LIMITS = {
  business: 600,
  audience: 400,
  timesink: 600,
  next30: 400,
  stage: 80,
  firstName: 60,
  email: 160,
  channels: 12,
  channel: 40,
  bodyBytes: 8000,
};

export interface Profile {
  business: string;
  audience: string;
  channels: string[];
  stage: string;
  timesink: string;
  next30: string;
}

export interface Intake extends Profile {
  firstName: string;
  email: string;
}

// Control characters have no business in free text, and they are a cheap way
// to smuggle structure into a prompt.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, "").trim().slice(0, max);
}

export type ParseResult =
  | { ok: true; value: Intake }
  | { ok: false; error: string };

export function parseIntake(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Malformed request." };
  }
  const body = raw as Record<string, unknown>;

  // Honeypot: the form field is visually hidden, so a real person leaves it empty.
  if (clean(body.website, 200)) {
    return { ok: false, error: "Malformed request." };
  }

  const business = clean(body.business, LIMITS.business);
  const timesink = clean(body.timesink, LIMITS.timesink);
  const firstName = clean(body.first_name, LIMITS.firstName);
  const email = clean(body.email, LIMITS.email).toLowerCase();

  if (business.length < 15) {
    return { ok: false, error: "Tell me a bit more about what you make and sell." };
  }
  if (timesink.length < 10) {
    return { ok: false, error: "Tell me what eats your time — that answer shapes the prompts." };
  }
  if (!firstName) {
    return { ok: false, error: "First name, please." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "That email doesn't look right." };
  }

  const channels = Array.isArray(body.channels)
    ? body.channels
        .slice(0, LIMITS.channels)
        .map((c) => clean(c, LIMITS.channel))
        .filter(Boolean)
    : [];

  return {
    ok: true,
    value: {
      business,
      audience: clean(body.audience, LIMITS.audience),
      channels,
      stage: clean(body.stage, LIMITS.stage),
      timesink,
      next30: clean(body.next30, LIMITS.next30),
      firstName,
      email,
    },
  };
}

/** The client IP, for rate limiting. Netlify sets x-nf-client-connection-ip. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}
