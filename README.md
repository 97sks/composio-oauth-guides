# OAuth App Setup Guides

Take-home for the APM Integrations assignment ([ASSIGNMENT.md](ASSIGNMENT.md)).

A developer looks up an app and gets a shareable guide: how hard it is to get an OAuth app ready, how long it takes (effort and approval waits shown separately), what could block them, and which steps an agent can do versus which they must do themselves. For an app not in the library, an agent researches the provider and generates a guide on demand.

## Links

- **Live app:** https://composio-oauth-guides.vercel.app
- **Source repository:** https://github.com/97sks/composio-oauth-guides
- **Tutorial / walkthrough:** [OAuth Guides Tutorial](https://claude.ai/artifact/22vEauAc4DmGaqeJSbnXRn), an animated four-step walkthrough of the UI.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # put your own ANTHROPIC_API_KEY in it
npm run dev                  # http://localhost:3000 opens the UI
```

| Variable | Used for | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Live guide generation. Without it, library guides still open and other apps show a clear "key not set" message. | none |
| `COMPOSIO_API_KEY` | Checks whether Composio already ships a managed OAuth app for the provider. Without it the check is labelled "not tested". | none |
| `PIPELINE_MODEL` | Model for every pipeline call | `claude-sonnet-5-5` |
| `GUIDE_MAX_COST_USD` | Hard cost cap per guide | `0.60` |
| `GUIDE_MAX_REPAIR_TRIES` | Repair tries after a failed validation | `2` |
| `GENERATE_ENABLED` | Turn the public endpoint off | `true` |
| `GENERATE_RATE_LIMIT_PER_DAY` | Per-IP limit on non-library generations in any rolling 24 hours | `3` |

Never commit a real key. `.env.local` is git-ignored.

Useful commands: `npm test` (offline), `npm run typecheck`, `npm run lint`, `npm run generate -- "HubSpot"` (live run from the terminal, spends real money up to the cap), `npm run embed` (re-embed library guides into the UI after editing one).

## What is here

- **Library guides:** GitHub (easy), Gmail/Google (hard), Slack (moderate). They were chosen because their setup and approval paths differ most.
- **Live generation:** `POST /api/generate` checks the library, then runs a fixed pipeline: find official docs, read them, turn each fact and its verbatim quote into a claim, write the guide from those claims, validate it against the schema, repair if needed. Progress and running cost stream to the page.
- **UI:** [public/prototype.html](public/prototype.html), a static page served by Next.js.
- Design details: [docs/AGENT_DESIGN.md](docs/AGENT_DESIGN.md), [docs/COMPOSIO_SYSTEM_DESIGN.md](docs/COMPOSIO_SYSTEM_DESIGN.md).

## How we approached the problem

1. **Read a lot of OAuth documentation first.** Before writing code we read provider docs and Composio's managed OAuth app directory to understand what a provider OAuth app is, how it relates to a developer's integration and to their users' connections, and where setups differ (instant, org-owner approval, scope verification, security assessment, marketplace review).
2. **Break the generic OAuth journey into parts and sub-parts.** Every provider, however different, passes through the same stages: registration (account, app, redirect URIs, credentials), scoping (which scopes and where they are declared), approval (what triggers a review, how long, what you can do meanwhile), and execution (the token flow, expiry, refresh, limits). Each stage splits into sub-parts such as outputs, redirect rules, approval paths with interim limits, and token-flow facts, and each step is tagged by who does it: agent, you, or wait.
3. **Turn that breakdown into an agent output schema.** The parts and sub-parts became one validated schema ([lib/guide-schema.ts](lib/guide-schema.ts)). We hand-researched three guides against it (GitHub, Gmail, Slack) to test whether the schema fits providers with very different journeys, then pointed the live agent at the same schema so any app produces a guide in the same shape.
4. **Make evidence part of the schema.** Claims, sources and quotes are required fields, so uncertainty is visible rather than smoothed over.

## Key decisions

1. **Lead with the verdict, not the steps.** The core pain is not knowing whether setup is an hour or weeks, so difficulty and time come first.
2. **Split every step by who does it** (`agent`, `you`, `wait`). Agents can draft listing text, compute least-privilege scopes and create the auth config. Humans create provider accounts, pass identity checks, accept terms, submit for review and wait.
3. **Evidence over polish.** Every statement cites claims, every claim cites sources. Claims are `sourced`, `anecdotal`, `uncertain` or `verified` (only for things we tested ourselves). A guide that says "uncertain" beats one that is confidently wrong.
4. **The agent is a fixed pipeline, not a free-running loop.** Evidence status and derived values are computed in code, so the model cannot claim more than its sources support. Chosen over a single autonomous loop (less predictable) and a multi-agent setup (more cost and latency).
5. **Hard cost cap per guide** ($0.60, at most 6 searches, 6 pages, 2 repair tries, 180 s). Hitting a cap returns a partial guide marked incomplete instead of failing.
6. **End every guide in Composio's steps:** register the redirect URI, create a `use_custom_auth` auth config, pass `auth_configs` in the session, check the account reaches `ACTIVE`.
7. **Tell users Composio managed auth may already cover them.** A developer may not need their own OAuth app at all, so every guide records whether Composio ships a managed app (`managedAuth`: available, not available, or unknown) and what a custom app buys them. Live runs query Composio for this; if the key is missing the check is shown as "not tested", never guessed.
8. **"Share" means "Copy markdown for agent", not a link.** The reader is often another agent or a developer pasting into a coding assistant, so the share action copies the whole guide as plain markdown (verdict, steps tagged by who does them, blockers, approval paths, sources, open questions) that an agent can read and act on directly. This also works for live guides, which are not saved at a URL. Built: the guide drawer's **Copy markdown for agent** button (`toMarkdown` in [public/prototype.html](public/prototype.html)). Only tested for syntax, not clicked through in a browser.

## What was checked

Library guides were researched against official provider pages (GitHub 7 sources, Gmail 14, Slack 11). Gmail and Slack evidence quotes (45 and 31) were re-matched against the raw page text with `scripts/verify-quotes.ts`. A matching quote proves the words are on the page, not that the claim reads them correctly. No OAuth app was registered or submitted, so no claim is `verified`.

What the checks changed:
- **Gmail:** `gmail.metadata` is a *restricted* scope, not a lighter option; the 100-user cap lives on the app audience page; the 7-day refresh-token expiry applies to external apps in Testing; restricted verification includes an annual third-party assessment (CASA).
- **Slack:** the verdict is **moderate**, not hard. Unlisted distribution is self-serve and unreviewed; Marketplace review (up to about 10 weeks plus feedback) applies only to a listing.
- **Live runs:** three HubSpot runs (one complete at $0.349, two incomplete). The model overclaimed that a Marketplace review was required and drifted on enum words; both were fixed in code and prompts and re-tested offline only. Composio's managed-auth lookup worked live.

Left uncertain: PKCE on Google's web server flow, what `chat:write` grants, CASA cost, real review times, and whether any generated guide matches the real provider console.

## Limitations

- Live guides are not saved at a URL; "Copy markdown for agent" is the way to share one. It has not been tried in a browser.
- The managed-auth callout is checked live for generated guides; the library guides carry it as `unknown` until verified against Composio.
- Composio auth-config creation and the Connect Link test are not built.
- No provider approvals were attempted and no paid accounts used. The agent reads public docs only; anything behind a provider login is marked unverified.
- Only three real live runs (all HubSpot, $0.35 to $0.51), so the cap is tuned to little data and an unfamiliar provider may come back incomplete. Fixes since those runs have not been re-run live.
- The public endpoint has only an in-memory per-IP limit and the cost cap; it needs real rate limiting before being exposed.
- "Official source" is a domain heuristic, so a lookalike domain could be mistaken for official.
- Review durations are rarely published; figures from forums or blogs are labelled anecdotal.
- Provider consoles change. Each guide records the date it was last checked.
