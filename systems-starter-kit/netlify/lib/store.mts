import { getStore, getDeployStore } from "@netlify/blobs";

/** Keep preview/branch traffic out of the production stores. */
function isProduction(): boolean {
  // @ts-expect-error - the Netlify global is injected at runtime.
  return globalThis.Netlify?.context?.deploy?.context === "production";
}

/**
 * Jobs are written by the background function and read by the polling
 * function moments later, so eventual consistency (up to 60s) is not an
 * option here - reads must see the latest write.
 */
export function jobStore() {
  const opts = { name: "systems-kit-jobs", consistency: "strong" as const };
  return isProduction() ? getStore(opts) : getDeployStore(opts);
}

/** Rate-limit counters are only useful if a read sees the previous write. */
export function rateStore() {
  const opts = { name: "systems-kit-rate", consistency: "strong" as const };
  return isProduction() ? getStore(opts) : getDeployStore(opts);
}

export type JobStatus = "pending" | "running" | "done" | "error";

export interface JobRecord {
  status: JobStatus;
  created_at: string;
  first_name?: string;
  result?: unknown;
  error?: string;
  /** Raw failure description; surfaced only while DEBUG_ERRORS is on. */
  detail?: string;
}
