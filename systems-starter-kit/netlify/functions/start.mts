import type { Config, Context } from "@netlify/functions";
import { jobStore, rateStore, type JobRecord } from "../lib/store.mts";
import { LIMITS, clientIp, parseIntake } from "../lib/validate.mts";

const DEFAULT_IP_LIMIT = 5;
const DEFAULT_GLOBAL_LIMIT = 400;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Increment a daily counter and report whether it is now over the cap. */
async function overLimit(key: string, cap: number): Promise<boolean> {
  const store = rateStore();
  const current = (await store.get(key, { type: "json" })) as { n?: number } | null;
  const n = (current?.n ?? 0) + 1;
  await store.setJSON(key, { n });
  return n > cap;
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const raw = await req.text();
  if (raw.length > LIMITS.bodyBytes) {
    return json({ error: "That's more than I need — trim it down a little." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  const parsed = parseIntake(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }
  const intake = parsed.value;

  const day = today();
  const ipCap = Number(Netlify.env.get("DAILY_IP_LIMIT") || DEFAULT_IP_LIMIT);
  const globalCap = Number(Netlify.env.get("DAILY_GLOBAL_LIMIT") || DEFAULT_GLOBAL_LIMIT);

  if (await overLimit(`ip:${clientIp(req)}:${day}`, ipCap)) {
    return json(
      { error: "You've generated a few sets today already. Try again tomorrow." },
      429,
    );
  }

  // A cheap ceiling on the daily API bill if this ever gets posted somewhere big.
  if (await overLimit(`global:${day}`, globalCap)) {
    return json(
      { error: "This got busier than expected today. Try again tomorrow and it'll be back." },
      429,
    );
  }

  const jobId = crypto.randomUUID();
  const record: JobRecord & { intake: typeof intake } = {
    status: "pending",
    created_at: new Date().toISOString(),
    first_name: intake.firstName,
    intake,
  };
  await jobStore().setJSON(jobId, record);

  // Netlify synchronous functions cap out around 10s, which a generation will
  // not fit inside. Hand the work to the background function (15 min budget)
  // and let the browser poll /api/result. The POST below returns 202 in
  // milliseconds; only the job id travels, the intake stays in the blob.
  try {
    await fetch(new URL("/.netlify/functions/generate-background", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId }),
    });
  } catch (err) {
    console.error("could not start background job", jobId, err);
    await jobStore().setJSON(jobId, {
      ...record,
      status: "error",
      error: "Could not start the generator.",
    });
    return json({ error: "Something broke on my end. Try again in a minute." }, 502);
  }

  return json({ job_id: jobId });
};

export const config: Config = {
  path: "/api/start",
};
