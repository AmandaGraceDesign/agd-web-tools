/** The branded address people get in their emails. */
export const PROMPTS_ORIGIN = "https://prompts.creativesystemslab.com";

/**
 * Where a visitor's saved prompts live, for the link in their Kit email.
 *
 * Production always uses the branded domain, so the link never depends on
 * which domain is set as primary in Netlify. Previews and branch deploys use
 * their own URL, because their saved results live in a separate store that
 * the production site cannot read.
 */
export function promptsBaseUrl(deployContext: string | undefined, netlifyUrl: string | undefined): string {
  const base = deployContext === "production" ? PROMPTS_ORIGIN : netlifyUrl || "";
  return base.replace(/\/$/, "");
}
