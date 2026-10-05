/**
 * Intake v2 (2026-10-05): five questions, four of them taps.
 *
 * Q1 makes        - one choice, plus a short text box when "other"
 * Q2 sells        - any number of choices
 * Q3 bottleneck   - one choice; this is the routing question
 * Q4 claude       - one choice; this gates the route
 * Q5 goal         - one typed sentence: what they want done in 90 days
 *
 * Every tap answer is checked against a fixed list. Only the two text boxes
 * carry free text from the public, and both are capped and control-stripped.
 */

export const MAKES = {
  patterns: "Surface patterns",
  illustration: "Illustration / prints",
  handmade: "Handmade goods",
  digital: "Digital products",
  teaching: "Teaching / courses",
  other: "Something else",
} as const;

export const SELLS = {
  spoonflower: "Spoonflower",
  etsy: "Etsy",
  shopify: "Shopify / my own site",
  licensing: "Licensing to brands",
  wholesale: "Wholesale / shops",
  markets: "Markets / in person",
  none: "Not selling yet",
} as const;

export const BOTTLENECKS = {
  no_sales: "I post, but nobody buys",
  not_found: "Nobody can find me online",
  no_list: "I don't have an email list (or I'm scared of mine)",
  offer: "People look, then leave. My offer isn't landing",
  admin: "Admin. Everything is manual and I'm drowning",
  collection: "My next collection is stuck and won't get out the door",
  reexplain: "I keep re-explaining the same things to Claude",
} as const;

export const CLAUDE_LEVELS = {
  never: "Never used it",
  free_sometimes: "Free plan, now and then",
  free_daily: "Free plan, daily",
  pro: "Paid Pro plan",
} as const;

export type MakesKey = keyof typeof MAKES;
export type SellsKey = keyof typeof SELLS;
export type BottleneckKey = keyof typeof BOTTLENECKS;
export type ClaudeLevelKey = keyof typeof CLAUDE_LEVELS;

/** Input caps. These bound both abuse and the per-call token bill. */
export const LIMITS = {
  makesOther: 80,
  goal: 300,
  firstName: 60,
  email: 160,
  bodyBytes: 4000,
};

export interface Profile {
  makes: MakesKey;
  makesOther: string;
  sells: SellsKey[];
  bottleneck: BottleneckKey;
  claude: ClaudeLevelKey;
  goal: string;
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
  return value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function oneOf<T extends Record<string, string>>(table: T, value: unknown): keyof T | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(table, value)
    ? (value as keyof T)
    : null;
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

  const makes = oneOf(MAKES, body.makes);
  if (!makes) return { ok: false, error: "Tap what you make." };

  const makesOther = clean(body.makes_other, LIMITS.makesOther);
  if (makes === "other" && makesOther.length < 3) {
    return { ok: false, error: "Tell me in a few words what you make." };
  }

  const sells = Array.isArray(body.sells)
    ? Array.from(
        new Set(
          body.sells
            .map((s) => oneOf(SELLS, s))
            .filter((s): s is SellsKey => s !== null),
        ),
      )
    : [];
  if (!sells.length) return { ok: false, error: "Tap at least one place you sell." };

  const bottleneck = oneOf(BOTTLENECKS, body.bottleneck);
  if (!bottleneck) return { ok: false, error: "Tap what's eating your week." };

  const claude = oneOf(CLAUDE_LEVELS, body.claude);
  if (!claude) return { ok: false, error: "Tap where you are with Claude." };

  const goal = clean(body.goal, LIMITS.goal);
  if (goal.length < 10) {
    return { ok: false, error: "Give me one sentence on what you want done in the next 90 days." };
  }

  const firstName = clean(body.first_name, LIMITS.firstName);
  const email = clean(body.email, LIMITS.email).toLowerCase();
  if (!firstName) return { ok: false, error: "First name, please." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "That email doesn't look right." };

  return {
    ok: true,
    value: {
      makes,
      makesOther: makes === "other" ? makesOther : "",
      sells,
      bottleneck,
      claude,
      goal,
      firstName,
      email,
    },
  };
}

/** Human-readable "what they make", for the model and for Kit. */
export function makesLabel(intake: Pick<Intake, "makes" | "makesOther">): string {
  return intake.makes === "other" ? intake.makesOther : MAKES[intake.makes];
}

/** The client IP, for rate limiting. Netlify sets x-nf-client-connection-ip. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}
