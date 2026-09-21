# AGD Web Tools

Public-facing web tools and lead magnets for Amanda Grace Design — Creative Systems Lab
and PatternPAL Pro. Static pages plus Netlify serverless functions.

Separate from [`amanda-agent`](https://github.com/AmandaGraceDesign/amanda-agent), which
is the private scheduled Python backend (email triage, KPIs, Notion). Nothing is shared
between the two: different language, different runtime, different deploy target. This
repo is the one Netlify gets to read.

## What's here

| Folder | What it is | Status |
|---|---|---|
| [`systems-starter-kit/`](./systems-starter-kit) | Ten AI prompts written for the visitor's actual business. Replaces the SYSTEMS lead magnet PDF. Email-gated into Kit. | Built, not yet deployed |

## Adding another tool

One folder per tool, each self-contained with its own `package.json`, `netlify.toml`,
and functions. Each gets its own Netlify site with **Base directory** set to that folder.
Keeping them separate means one tool's build or dependency problem can never take another
one down.

## House rules

- Secrets live in Netlify environment variables. Never in the repo, never in client code.
- Anything a model returns is rendered with `textContent`, never `innerHTML`.
- Free-text fields from the public are capped, control-stripped, and treated as data —
  never as instructions — by any prompt they reach.
- Every tool carries its own README with a deploy runbook and its running cost per lead.
