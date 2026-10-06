# Ten AI Prompts For Your Actual Business

Replaces the SYSTEMS lead magnet PDF ("10 AI Prompts That Actually Work — Creative
Systems Lab AI Starter Kit"). Instead of a static download, the visitor describes their
creative business and gets ten Claude prompts written around it. Email gate before results.


## v2 (2026-10-05): five-question diagnostic + CSL routing

Approved by Mandy 2026-10-05. The intake is five questions, four of them taps:
what you make, where you sell, what's eating your week (the routing question),
where you are with Claude (the gate), and one typed sentence on the 90-day goal.

- `netlify/lib/routing.mts` maps the answers to one CSL session. "Never used it"
  always goes to free Sessions 1 & 2 first. Below Pro + Session 7 or later shows
  the Pro note. Live vs replay flips on its own from the session dates. Prices,
  URLs and dates live in that file only.
- Kit: the subscriber is created first (v4 will not add an unknown email to a
  form; v1 had this backwards, so new emails never landed), then added to form
  10007140 "CSL Prompt Generator (tool)" (incentive email off; a Kit automation
  on that form sends the welcome with `prompts_url`), then tagged `CSL Prompt Generator` + one `CSL PG Route - ...` tag.
  Answers go to custom fields `pg_makes`, `pg_business_name`, `pg_sells`,
  `pg_buyer`, `pg_bottleneck`, `pg_claude_level`, `pg_goal`, `pg_route`, plus
  `prompts_url`. Before the route tag goes on, every other `CSL PG Route - ...`
  tag is removed, so a rerun leaves only the current route.
- Two optional text answers (added 2026-10-05): business name under question 1
  (80 chars) and "Who buys from you?" as question 3 (200 chars). Both go to the
  model so the prompts use the name and write for that buyer.
- Tag and field IDs were created 2026-10-05 and are hard-coded in `kit.mts`.

## Domain

Live at **https://prompts.creativesystemslab.com** (custom domain on the agd-web-tools
Netlify site, CNAME `prompts` -> `agd-web-tools.netlify.app`). The prompts link saved to
Kit (`prompts_url`) always uses this domain in production; see `netlify/lib/urls.mts`.
Old `agd-web-tools.netlify.app` links keep working.

## Meta pixel + Conversions API

Pixel **AGD_New-Kajabi_Site_2025** (`1796200234246406`, same as the Kajabi site) fires
from the browser: `PageView`, `PG_QuestionsDone`, `Lead`, `PG_PromptsDelivered`,
`PG_SessionClick`, `PG_CopyPrompt`, `PG_CopyAll`, `PG_Download`. No answers, names or
emails go through the browser pixel.

`Lead` is also sent server-side from the background function (`netlify/lib/meta.mts`)
with SHA-256 hashed email and first name, IP, user agent and the `_fbp` / `_fbc`
cookies, so ad blockers and iOS settings can't hide it. Both copies use the job id as
the event ID, so Meta counts one Lead.

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
   Nothing to configure — the root `netlify.toml` sets the base directory.

2. **Add the environment variables** in *Site configuration → Environment variables*:

   | Variable | Value | Notes |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | your key | console.anthropic.com → API Keys. Paste it here only — it never belongs in the repo. |
   | `KIT_API_KEY` | your Kit v4 key | Kit → Settings → Developer → API Keys (the **v4** key, not v3). |
   | `KIT_FORM_ID` | `10007140` | Optional — this is the default. See the note below. |
   | `CLAUDE_MODEL` | `claude-opus-5` | Optional — the default. |
   | `CLAUDE_EFFORT` | `medium` | Optional — `low` / `medium` / `high`. |
   | `DAILY_IP_LIMIT` | `5` | Optional — generations per visitor per day. |
   | `DAILY_GLOBAL_LIMIT` | `400` | Optional — ceiling on the daily API bill. |
   | `META_CAPI_TOKEN` | Conversions API token | Events Manager → AGD_New-Kajabi_Site_2025 → Settings → Conversions API → Generate access token. Mark it secret. Without it the server-side Lead is skipped (the browser pixel still works). |
   | `META_TEST_EVENT_CODE` | e.g. `TEST12345` | Optional — only while checking events in Events Manager → Test events. Remove after. |
   | `META_GRAPH_VERSION` | `v23.0` | Optional — the default. |

3. **Deploy**, then run one real generation end to end. Check the email landed in Kit.

4. **Point ManyChat at it.** In the `CSL - AI 10 Prompts Starter Kit Funnel` automation,
   replace the Google Drive PDF link with https://prompts.creativesystemslab.com. Nothing else in the flow changes —
   the SYSTEMS trigger, the follower gate, and the comment reply all stay as they are.

## The Kit form

`KIT_FORM_ID` defaults to **10007140 — "CSL Prompt Generator (tool)"**, created
2026-10-05 for this tool only. Its incentive email is off; a Kit automation on the form
sends the welcome email with the visitor's `prompts_url`.

Do not point the tool at **9454523 — "CSL — 10 AI Prompts Freebie"**. That form still
delivers the PDF to website, blog and summit signups (511 subscribers on 2026-10-05), so
its incentive email has to keep talking about the PDF. The form ID **9374679** named in
the original handoff doc is *"CSL Positioning Interview"*, the wrong funnel entirely.

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
