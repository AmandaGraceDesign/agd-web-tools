import type { Config, Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Temporary diagnostic endpoint.
 *
 * Function logs are not reachable from every environment this gets debugged
 * from, so this reproduces the two Claude request shapes the generator uses
 * and reports what each one does. Visiting it in a browser is enough.
 *
 * Gated on DEBUG_ERRORS so it is not a public endpoint, and meant to be
 * deleted once the generator is working.
 */

function describe(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; status?: number; message?: string };
    return [e.name, e.status ? `HTTP ${e.status}` : "", e.message]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 600);
  }
  return String(err).slice(0, 600);
}

const TINY_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

export default async (_req: Request, _context: Context) => {
  if (Netlify.env.get("DEBUG_ERRORS") !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY") || "";
  const model = Netlify.env.get("CLAUDE_MODEL") || "claude-opus-5";
  const effort = Netlify.env.get("CLAUDE_EFFORT") || "medium";

  const report: Record<string, unknown> = {
    anthropic_key_present: Boolean(apiKey),
    anthropic_key_length: apiKey.length,
    anthropic_key_prefix: apiKey.slice(0, 7),
    kit_key_present: Boolean(Netlify.env.get("KIT_API_KEY")),
    model,
    effort,
    node: process.version,
  };

  if (!apiKey) {
    return Response.json({ ...report, verdict: "ANTHROPIC_API_KEY is not set" });
  }

  const client = new Anthropic({ apiKey });
  const messages = [{ role: "user" as const, content: 'Reply with {"ok":true}' }];

  // 1. Plainest possible call - isolates key and model access from everything else.
  try {
    const r = await client.messages.create({ model, max_tokens: 64, messages });
    report.plain_call = `ok (stop_reason: ${r.stop_reason})`;
  } catch (err) {
    report.plain_call = describe(err);
  }

  // 2. The structured-output shape the generator actually uses.
  try {
    await client.messages.create({
      model,
      max_tokens: 64,
      output_config: { effort, format: { type: "json_schema", schema: TINY_SCHEMA } },
      messages,
    } as Anthropic.MessageCreateParamsNonStreaming);
    report.structured_call = "ok";
  } catch (err) {
    report.structured_call = describe(err);
  }

  return Response.json(report);
};

export const config: Config = {
  path: "/api/diag",
};
