import type { Context } from "@netlify/functions";
import { jobStore, type JobRecord } from "../lib/store.mts";
import { generate } from "../lib/claude.mts";
import { subscribe } from "../lib/kit.mts";
import type { Intake } from "../lib/validate.mts";

type StoredJob = JobRecord & { intake?: Intake };

/**
 * A compact, quotable description of a failure - error class, HTTP status and
 * message. Stored on the job so a failure can be diagnosed without reading
 * function logs, which are not reachable from every environment this gets
 * debugged from. Never shown to visitors: /api/result only reveals it while
 * DEBUG_ERRORS is on.
 */
function describe(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; status?: number; message?: string };
    return [e.name, e.status ? `HTTP ${e.status}` : "", e.message]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 800);
  }
  return String(err).slice(0, 800);
}

/**
 * Long-running half of the flow: subscribe the visitor to Kit, then generate.
 *
 * This endpoint is publicly reachable, so it takes only a job id - never the
 * intake itself. The id is an unguessable UUID, and a job is only processed
 * while it is still "pending", so a replayed or invented id does no work and
 * costs no API credits.
 */
export default async (req: Request, _context: Context) => {
  let jobId = "";
  try {
    const body = (await req.json()) as { job_id?: unknown };
    jobId = typeof body.job_id === "string" ? body.job_id : "";
  } catch {
    return;
  }
  if (!jobId) return;

  const store = jobStore();
  const job = (await store.get(jobId, { type: "json" })) as StoredJob | null;

  if (!job || job.status !== "pending" || !job.intake) {
    console.warn("ignoring job that is not pending", jobId);
    return;
  }

  const intake = job.intake;

  // Claim the job so a duplicate delivery cannot generate twice.
  await store.setJSON(jobId, { ...job, status: "running" });

  // The email is the price of the tool, so capture it before generating - but
  // never let a Kit failure cost the visitor the prompts they filled a form for.
  // Netlify sets URL to the production site address.
  const siteUrl = (Netlify.env.get("URL") || "").replace(/\/$/, "");
  const promptsUrl = siteUrl ? `${siteUrl}/r/${jobId}` : undefined;

  const kit = await subscribe(intake, promptsUrl);
  if (!kit.ok) {
    console.error("kit subscribe failed", jobId, kit.status ?? "", kit.detail ?? "");
  }

  try {
    const result = await generate(intake);
    await store.setJSON(jobId, {
      status: "done",
      created_at: job.created_at,
      first_name: intake.firstName,
      kit_ok: kit.ok,
      result,
    });
    console.log("generated", jobId, `${result.prompts.length} prompts`, `kit_ok=${kit.ok}`);
  } catch (err) {
    console.error("generation failed", jobId, err);
    await store.setJSON(jobId, {
      status: "error",
      created_at: job.created_at,
      first_name: intake.firstName,
      kit_ok: kit.ok,
      error: "The generator didn't finish. Try again in a minute.",
      detail: describe(err),
    });
  }
};
