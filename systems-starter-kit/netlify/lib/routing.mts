/**
 * Routing: which CSL session one visitor should start with.
 *
 * Approved by Mandy 2026-10-05. Q3 (bottleneck) picks the session, then Q4
 * (Claude level) overrides it when needed:
 *   - "Never used it" goes to the free Sessions 1 & 2 first, whatever Q3 was.
 *   - Anyone below Pro who is routed to Session 7 or later is told plainly
 *     that it runs on Claude Pro. A filter, not an apology.
 *
 * Live vs replay is worked out from the clock, so a session flips to
 * "replay" on its own once it has run. Nothing here needs editing on a date.
 *
 * Prices and URLs are copied from creativesystemslab.com on 2026-10-05.
 * If a price changes, change it here and nowhere else.
 */

import type { BottleneckKey, ClaudeLevelKey } from "./validate.mts";

const SITE = "https://creativesystemslab.com";

interface Session {
  n: number;
  title: string;
  url: string;
  /** Free sessions show "Free" instead of a price. */
  free?: boolean;
  /** Sessions 7+ need Claude Pro. */
  pro?: boolean;
  /** When the live session ends. Absent = already ran, sold as a replay. */
  liveEndsUtc?: string;
  /** Shown as "Live Wednesday, Oct 14 at 1pm ET". */
  liveLabel?: string;
}

export const SESSIONS: Record<string, Session> = {
  s1: { n: 1, title: "Set Up Claude for Your Creative Business", url: `${SITE}/sessions/session-1`, free: true },
  s3: { n: 3, title: "Build Your Lead Magnet + Welcome Email Sequence", url: `${SITE}/sessions/session-3` },
  s4: { n: 4, title: "Your Offer & Reason-to-Buy with Claude", url: `${SITE}/sessions/session-4` },
  s5: { n: 5, title: "SEO Across POD, Etsy, Pinterest & Google", url: `${SITE}/sessions/session-5` },
  s6: { n: 6, title: "Caption & Content System with Claude", url: `${SITE}/sessions/session-6` },
  s7: { n: 7, title: "Get Out of Admin Chaos with Claude", url: `${SITE}/sessions/session-7`, pro: true },
  // 1pm ET = 17:00Z while daylight time runs (S9, S10); 18:00Z after Nov 1 (S12).
  s9: {
    n: 9,
    title: "Connect Claude to Your Apps: Get Your Next Collection Out the Door",
    url: `${SITE}/sessions/session-9`,
    pro: true,
    liveEndsUtc: "2026-10-14T18:30:00Z",
    liveLabel: "Live Wednesday, Oct 14 at 1pm ET",
  },
  s10: {
    n: 10,
    title: "Building Skills in Claude",
    url: `${SITE}/sessions/session-10`,
    pro: true,
    liveEndsUtc: "2026-10-28T18:30:00Z",
    liveLabel: "Live Wednesday, Oct 28 at 1pm ET",
  },
  s12: {
    n: 12,
    title: "Automations: Chain It All Together",
    url: `${SITE}/sessions/session-12`,
    pro: true,
    liveEndsUtc: "2026-11-25T19:30:00Z",
    liveLabel: "Live Wednesday, Nov 25 at 1pm ET",
  },
};

const PRICE_SINGLE = "$67";
/** One signup page that grants both free sessions (tags "CSL Free 1&2 Bundle - Signup"). */
const FREE_1_2_URL = "https://www.amandagracedesign.com/offers/dLLoKhDs";
const BUNDLE = { price: "$150", url: `${SITE}/sessions/bundle-of-3` };
const SEASON = { price: "$497", url: `${SITE}/founding-season`, sellsUntilUtc: "2027-01-01T05:00:00Z" };

/** Why this session, in one or two sentences, keyed by the Q3 answer. */
const ROUTES: Record<BottleneckKey, { session: string; why: string; next?: string; nextWhy?: string }> = {
  no_sales: {
    session: "s6",
    why: "Posting isn't the problem. Posting without a system is. You build a caption and content system inside Claude so every post has a job to do.",
  },
  not_found: {
    session: "s5",
    why: "You build one keyword set that your listings, pins and posts all pull from, so the people searching for what you make actually land on you.",
  },
  no_list: {
    session: "s3",
    why: "You build the freebie and the welcome emails that go with it. Your list starts the day you leave the session.",
  },
  offer: {
    session: "s4",
    why: "You sharpen what you sell and the reason someone buys it now, not someday.",
  },
  admin: {
    session: "s7",
    why: "You get the admin pile out of your head and into one list Claude helps you work through every week.",
    next: "s12",
    nextWhy: "Then Session 12 chains the repeat jobs together so they run without you.",
  },
  collection: {
    session: "s9",
    why: "Claude connects to the apps you already use and builds the one-sheet, the email and the plan that get the collection out the door.",
  },
  reexplain: {
    session: "s10",
    why: "You teach Claude how you do a job once, as a skill, and stop explaining it every single time.",
  },
};

export interface RouteLink {
  session: number;
  title: string;
  url: string;
  /** "Free", "$67", etc. */
  price: string;
  /** "Live Wednesday, Oct 14 at 1pm ET" or "Replay, yours to keep". */
  when: string;
  live: boolean;
  /** Overrides the "Session N: title" line when one link covers more than one session. */
  heading?: string;
  /** Overrides the "See Session N" button label. */
  cta?: string;
}

export interface Recommendation {
  /** Stable key for Kit and analytics, e.g. "s6" or "s1-then-s9". */
  key: string;
  headline: string;
  why: string;
  primary: RouteLink;
  /**
   * Free Session 2 as a separate link. No longer set: Sessions 1 & 2 share one
   * signup page now. Kept so results saved before that change still render.
   */
  alsoFree?: RouteLink;
  next?: RouteLink & { why: string };
  proNote?: string;
  bundle?: { price: string; url: string; line: string };
  season?: { price: string; url: string; line: string };
}

function link(key: string, now: Date): RouteLink {
  const s = SESSIONS[key];
  const live = !!s.liveEndsUtc && now.getTime() < Date.parse(s.liveEndsUtc);
  return {
    session: s.n,
    title: s.title,
    url: s.url,
    price: s.free ? "Free" : PRICE_SINGLE,
    when: s.free ? "Replay" : live ? s.liveLabel! : "Replay, yours to keep",
    live,
  };
}

const PRO_NOTE =
  "This one runs on Claude Pro ($20 a month, paid to Anthropic). Pro is the plan where Claude stops being a chat window and starts doing real work in your business.";

export function recommend(
  bottleneck: BottleneckKey,
  claude: ClaudeLevelKey,
  now: Date = new Date(),
): Recommendation {
  const route = ROUTES[bottleneck];
  const target = link(route.session, now);
  const targetIsPro = !!SESSIONS[route.session].pro;

  const season =
    now.getTime() < Date.parse(SEASON.sellsUntilUtc)
      ? {
          price: SEASON.price,
          url: SEASON.url,
          line: `Want all of it? The Founding Season is Sessions 3 through 12 plus four Build Clinics, with every replay yours to keep, for ${SEASON.price}.`,
        }
      : undefined;

  // Never used Claude: the free sessions come first, no matter what Q3 said.
  if (claude === "never") {
    return {
      key: `s1-then-${route.session}`,
      headline: "Start here: free Sessions 1 & 2",
      why: "You're new to Claude, so set it up properly first. Session 1 sets Claude up for your business. Session 2 teaches the prompting formula these ten prompts are built on. Both are free.",
      primary: {
        ...link("s1", now),
        url: FREE_1_2_URL,
        when: "Replays",
        heading: "Sessions 1 & 2: Set Up Claude + the Prompting Formula",
        cta: "Get free Sessions 1 & 2",
      },
      next: { ...target, why: `When you're ready for the thing eating your week: ${route.why}` },
      ...(targetIsPro ? { proNote: PRO_NOTE } : {}),
    };
  }

  const next = route.next ? { ...link(route.next, now), why: route.nextWhy! } : undefined;

  return {
    key: route.session,
    headline: `Start here: Session ${target.session}`,
    why: route.why,
    primary: target,
    ...(next ? { next } : {}),
    ...(targetIsPro && claude !== "pro" ? { proNote: PRO_NOTE } : {}),
    ...(next && season
      ? {
          bundle: {
            ...BUNDLE,
            line: `Doing both? Any three sessions are ${BUNDLE.price} as a bundle: these two plus one more you pick.`,
          },
        }
      : {}),
    ...(season ? { season } : {}),
  };
}
