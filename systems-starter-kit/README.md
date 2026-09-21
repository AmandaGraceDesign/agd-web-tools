# Ten AI Prompts For Your Actual Business

Replaces the SYSTEMS lead magnet PDF ("10 AI Prompts That Actually Work — Creative
Systems Lab AI Starter Kit"). Instead of a static download, the visitor describes their
creative business and gets ten Claude prompts written around it. Email gate before results.

## How it runs

```
browser  ─→  POST /api/start
              validate · honeypot · rate limit · write job to Blobs
              kick the background function · return { job_id }        (< 1s)

         ─→  POST /.netlify/functions/generate-background             (15 min budget)
              subscribe to Kit · call Claude · write result to Blobs

         ─→  GET /api/result?job=ID    polled every 2.5s              (fast)
```

A Netlify synchronous function times out around 10 seconds — nowhere near enough for a
generation — which is why the work is split. Job records use Blobs with
`consistency: "strong"`; the default eventual consistency (up to 60s) would make the poll
read stale state.

The background function is publicly reachable, so it accepts **only a job id**, never the
intake. The id is an unguessable UUID and a job is processed only while `pending`, so a
replayed or invented id does no work and spends no API credits.

## Deploy — Mandy's clicks, about 20 minutes

1. **Create the Netlify site** from this repo (`AmandaGraceDesign/agd-web-tools`).
   In *Site configuration → Build & deploy → Build settings*, set
   **Base directory** to `systems-starter-kit`. That makes Netlify read the
   `netlify.toml` in this folder; publish directory and functions path come from it.

2. **Add the environment variables** in *Site configuration → Environment variables*:

   | Variable | Value | Notes |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | your key | console.anthropic.com → API Keys. Paste it here only — it never belongs in the repo. |
   | `KIT_API_KEY` | your Kit v4 key | Kit → Settings → Developer → API Keys (the **v4** key, not v3). |
   | `KIT_FORM_ID` | `9454523` | Optional — this is the default. See the note below. |
   | `CLAUDE_MODEL` | `claude-opus-5` | Optional — the default. |
   | `CLAUDE_EFFORT` | `medium` | Optional — `low` / `medium` / `high`. |
   | `DAILY_IP_LIMIT` | `5` | Optional — generations per visitor per day. |
   | `DAILY_GLOBAL_LIMIT` | `400` | Optional — ceiling on the daily API bill. |

3. **Deploy**, then run one real generation end to end. Check the email landed in Kit.

4. **Point ManyChat at it.** In the `CSL - AI 10 Prompts Starter Kit Funnel` automation,
   replace the Google Drive PDF link with the new URL. Nothing else in the flow changes —
   the SYSTEMS trigger, the follower gate, and the comment reply all stay as they are.

## The Kit form

`KIT_FORM_ID` defaults to **9454523 — "CSL — 10 AI Prompts Freebie"**.

Verified against the live account on 2026-09-21: 501 subscribers, most recent signup the
day before. The form ID **9374679** named in the original handoff doc is *"CSL Positioning
Interview"* — 30 subscribers, none since 2026-05-08. Wiring the tool there would have sent
every SYSTEMS lead into the wrong funnel.

## Cost

Each completed generation is one Claude call, roughly 1.5K input / 3.5K output including
thinking. On `claude-opus-5` at $5/$25 per MTok that is about **$0.09 a lead** — around
$90 per 1,000 signups.

`CLAUDE_MODEL` and `CLAUDE_EFFORT` exist so that is a dial and not a rebuild.
`claude-sonnet-5` cuts it to roughly $0.04 a lead; `CLAUDE_EFFORT=low` trims it further at
some cost to how tailored the prompts feel. `DAILY_GLOBAL_LIMIT` is the hard ceiling.

## Local development

```bash
npm install
npm run typecheck
npm test
npm run dev        # netlify dev, needs the Netlify CLI and the env vars above
```

## Files

```
index.html                                  the page: intake, email gate, results
app.js                                      three-step flow, start + poll, copy/download
netlify.toml                                build, functions dir, security headers
netlify/lib/validate.mts                    input caps, honeypot, control-char stripping
netlify/lib/validate.test.mts               unit tests for the above
netlify/lib/store.mts                       Blobs helpers, prod/preview scope split
netlify/lib/kit.mts                         Kit v4 subscribe (never throws)
netlify/lib/claude.mts                      system prompt + structured-output call
netlify/functions/start.mts                 /api/start
netlify/functions/generate-background.mts   the long half
netlify/functions/result.mts                /api/result
```

## Notes for whoever touches this next

- Model output is rendered with `textContent`, never `innerHTML`. Keep it that way.
- A Kit failure is logged but never blocks the visitor's results — they filled in a form
  to get prompts, and an outage on our side should not cost them that.
- The system prompt in `claude.mts` treats the business description as data and ignores
  instructions embedded in it. That guard is load-bearing; the field is a public text box.
- Every prompt must serve the business around the art, never generate the art. That line
  is the whole positioning of Creative Systems Lab.
