import type { Config, Context } from "@netlify/functions";
import { jobStore, type JobRecord } from "../lib/store.mts";

/** A job that never reports back should not leave the browser polling forever. */
const STALE_AFTER_MS = 5 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async (req: Request, _context: Context) => {
  const jobId = new URL(req.url).searchParams.get("job") || "";
  if (!jobId) {
    return json({ error: "Missing job id." }, 400);
  }

  const job = (await jobStore().get(jobId, { type: "json" })) as JobRecord | null;
  if (!job) {
    return json({ error: "I couldn't find that one. Start over?" }, 404);
  }

  if (job.status === "done") {
    return json({ status: "done", first_name: job.first_name, ...(job.result as object) });
  }

  if (job.status === "error") {
    return json({ status: "error", error: job.error || "Something broke on my end." }, 500);
  }

  const age = Date.now() - new Date(job.created_at).getTime();
  if (age > STALE_AFTER_MS) {
    return json(
      { status: "error", error: "That took longer than it should have. Try again?" },
      504,
    );
  }

  return json({ status: "pending" });
};

export const config: Config = {
  path: "/api/result",
};
