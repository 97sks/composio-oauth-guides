# OAuth App Setup Guides

Take-home for the APM Integrations assignment ([ASSIGNMENT.md](ASSIGNMENT.md)). A developer looks up an app and gets a shareable guide covering how hard it is to get an OAuth app ready, how long it takes (including approval waits), what could block them, and which steps an agent can do for them versus which they must do themselves. For an app not in the library, an agent researches the provider and generates a guide on demand.

> **Status: work in progress.** Built: the guide schema, **three library guides** ([GitHub](lib/guides/github.ts), [Gmail (Google)](lib/guides/google.ts), [Slack](lib/guides/slack.ts)), the **live generation pipeline** (`lib/pipeline/`) behind `POST /api/generate`, and the prototype UI that calls it ([public/prototype.html](public/prototype.html)). **Live runs so far (HubSpot, three of them): one completed, two did not, and the fixes made afterwards have only been tested offline.** See "What the live runs showed" below. **Notion and LinkedIn are deliberately not in the library**: they are meant to be generated live from the prototype and checked. Sections marked *(planned)* describe the target. This README is updated as each piece lands, so it never claims more than exists.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then put your own ANTHROPIC_API_KEY in it
npm run dev                  # http://localhost:3000 redirects to the prototype
```

Environment variables (see [.env.example](.env.example); `.env.local` is git-ignored, the example is committed). They are validated in [lib/env.ts](lib/env.ts).

| Variable | Used for | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Live guide generation. Without it, library guides still open; other apps get a clear "key not set" message and spend nothing. | none |
| `COMPOSIO_API_KEY` | Each live guide checks whether Composio already ships a managed OAuth app (`GET /api/v3.1/toolkits/{slug}`), sent only to backend.composio.dev. Auth-config and Connect Link tests are not built. Without it the check is labelled "not tested". | none |
| `PIPELINE_MODEL` | Model for every pipeline call | `claude-sonnet-5-5` |
| `GUIDE_MAX_COST_USD` | Hard cost cap per guide | `0.60` |
| `GUIDE_MAX_REPAIR_TRIES` | Repair tries after a failed validation | `2` |
| `GENERATE_ENABLED` | Turn the public endpoint off | `true` |
| `GENERATE_RATE_LIMIT_PER_HOUR` | Per-IP limit on non-library generations (in-memory, single instance) | `3` |

Never commit a real key. A key pasted into a chat or a ticket should be treated as exposed and rotated.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | The Next.js app |
| `npm test` | Offline tests: fetch parsing, claim stage and derived values, budget cap, the whole pipeline against a fake model |
| `npm run typecheck`, `npm run lint` | Type check and lint |
| `npm run generate -- "HubSpot"` | Run the live pipeline from the terminal (loads `.env.local`, spends real money up to the cap) |
| `npm run embed` | Re-embed the library guides and pipeline config into the prototype page |
| `npm run fetch:pages -- <outDir> <url...>` | Save pages' full raw text for research |
| `npm run verify:gmail -- <pagesDir...>` / `verify:slack` | Re-check every evidence quote of a library guide against the saved pages |

### Project structure

```
app/
  api/generate/route.ts   POST /api/generate: streams pipeline events as newline-delimited JSON
  layout.tsx, globals.css
lib/
  guide-schema.ts         the output schema and its cross-checks
  env.ts                  typed environment
  guides/                 the library: github.ts, google.ts, slack.ts, evidence.ts, index.ts (lookup)
  pipeline/
    run.ts                orchestrator: resolve > discover > extract > claim > assemble > validate > repair
    resolve.ts discover.ts extract.ts assemble.ts   the stages (discover, extract, assemble call the model)
    claim.ts derive.ts domains.ts fetch.ts          code-only logic: statuses, derived values, official domains, page text
    budget.ts config.ts                             per-guide cost cap and settings
    anthropic.ts json.ts types.ts prompts/          model call helper, JSON parsing, prompts
public/prototype.html     the UI (static page); / redirects here
scripts/                  CLI tools: generate, fetch-pages, verify-quotes, embed-guides, spikes
tests/                    offline tests
docs/                     AGENT_DESIGN.md, COMPOSIO_SYSTEM_DESIGN.md, LIBRARY_LOCK.md
```

## How it works

- **Guide schema (built).** Every guide is one object validated by `GuideSchema` in [lib/guide-schema.ts](lib/guide-schema.ts). It holds:
  - **Verdict:** difficulty, a **your-effort** range in hours, a **total-time** range in days (effort plus waits, with an `openEnded` flag when a required wait has no published figure), the provider wait, and confidence.
  - **Stages:** every step is tagged `registration`, `scoping`, `approval` or `execution`, and by who does it: `agent`, `you` or `wait`.
  - **Stage detail:** registration outputs and redirect rules; where scopes are declared (`console`, `runtime`, `both`); one or more approval paths, each with its own trigger, wait and interim limits (for example Google's 100-user cap); the token-flow facts.
  - **Evidence:** claims, sources and tests.
- **Citations are mandatory.** Every statement points at one or more claims, every claim at one or more sources, and every source has an https link. A source that nothing cites is rejected. A claim marked `sourced` needs an official source; `anecdotal` means only vendor or community reports; `uncertain` means sources conflict or are silent; `verified` is reserved for things we tried ourselves and needs a passed test. A wait figure marked `unpublished` cannot contain a number.
- **Library.** GitHub, Gmail (Google) and Slack are hand-researched and quote-checked; the lock list is in [docs/LIBRARY_LOCK.md](docs/LIBRARY_LOCK.md). Every other app, including Notion and LinkedIn, is generated live on request.
- **Live generation (built; three real runs made, none yet passing end to end after the latest fixes).** Submit an app name or URL (or press **Generate guide** on a card). `POST /api/generate` runs a fixed pipeline: it checks the library first, then finds the provider's official docs with web search, reads them with web fetch (one call per topic, in parallel), turns each fact and its verbatim quote into a claim whose status code decides, has the model write the guide from those claims, validates it against the schema, and makes up to two repair tries. It streams stage progress and running cost to the page. Every model call uses `claude-sonnet-5-5`. Design and stage details: [docs/AGENT_DESIGN.md](docs/AGENT_DESIGN.md).
- **Budget cap per guide.** Each live guide runs under a limit set in [lib/pipeline/config.ts](lib/pipeline/config.ts): **$0.60** total (hard stop; low-priority pages stop at 80%, $0.48), at most 6 searches, 6 pages read, **two repair tries** (not limited by the soft limit), and 180 seconds. Hitting a cap returns the partial guide marked incomplete instead of failing. The cost estimate behind these numbers (roughly $0.35-0.45 per guide) is an estimate, not a measurement, so headroom is thin and the limits will need tuning. Prices in the config are Anthropic's published rates as of 2026-11-03. Details: [AGENT_DESIGN.md](docs/AGENT_DESIGN.md#budget-cap-per-guide).
- **Quote-checked evidence.** Beside each library guide sits a list of verbatim quotes, one or more per claim. `npx tsx scripts/verify-quotes.ts <gmail|slack> <pagesDir...>` re-checks every quote against the raw page text saved by `scripts/fetch-pages.ts`. A matching quote proves the words are on the cited page, not that the claim reads them correctly.
- **Cost and tokens on every generate.** Whatever starts a generation (the box, a card's **Generate guide** button, or a library card) opens a drawer with a cost and token panel followed by the guide. A live run shows its metered usage per stage, in dollars and tokens, with the cap. A saved library guide shows $0.000 for viewing plus what researching it cost. If live generation cannot run (no key, rate limit, page opened as a file), the reason is shown with $0.000 and 0 tokens, and the placeholder is labelled as such: no number is ever invented. The schema's optional `run` field carries the figures.
- **Prototype.** [public/prototype.html](public/prototype.html) is a static page modelled on the Composio dashboard's Toolkits table, with a guide drawer, served by Next.js (`/` redirects to it). The three library guides and the pipeline settings are embedded by [scripts/embed-guides.ts](scripts/embed-guides.ts) (`npm run embed`); everything else comes from the API.

After editing a library guide, run `npm run embed`. Importing a guide parses it with `GuideSchema`, so a broken guide fails `npm test`.

## Key decisions

1. **Lead with the verdict, not the steps.** The assignment's core pain is not knowing whether setup is an hour or weeks, so difficulty and time (effort and wait shown separately) come first.
2. **Split every step by who does it.** Agents can draft listing text, compute least-privilege scopes and create the auth config. Humans must create provider accounts, pass identity checks, accept terms, submit for review and wait.
3. **Evidence over polish.** A guide that says "uncertain" is more useful than one that is confidently wrong, so uncertainty is shown in the guide.
4. **The agent is a fixed pipeline, not a free-running loop.** Stages are plain code (resolve, discover, fetch, extract, claim, assemble, validate, repair). The model is called inside the extract and assemble stages through the Anthropic API, with output checked against the Zod schema. Evidence status, claim counts and the range flags are computed in code, so the model cannot talk its way into a stronger claim than its sources support. Per-topic fetch and extract run in parallel. Every model call uses `claude-sonnet-5-5`. Chosen over a single autonomous tool loop (less predictable) and a multi-agent setup (more cost and latency for the demo). The stage list and status rules are in [AGENT_DESIGN.md](docs/AGENT_DESIGN.md).
5. **End every guide in Composio's fixed steps.** Register the redirect URI, create a `use_custom_auth` auth config, pass `auth_configs` in the session, then check the account reaches `ACTIVE`. Details are in [COMPOSIO_SYSTEM_DESIGN.md](docs/COMPOSIO_SYSTEM_DESIGN.md).

## Agent build status

| Piece | State |
|---|---|
| Output schema and validator | Built |
| Library guides: GitHub, Gmail (Google), Slack | Done, quote-checked (Gmail 45, Slack 31) |
| Pipeline stages, orchestrator, budget cap, `/api/generate` | Built; tested offline with a scripted fake model (happy path, library shortcut, repair, repair limit, budget stop) |
| Prototype UI wired to the endpoint (streaming log, live usage, incomplete and failure states) | Built; tested with real event streams against a stubbed page, not in a browser |
| **Real end-to-end runs** | Three HubSpot runs: one complete ($0.349, 48 s), two incomplete. Fixes since (enum normalization, page cap, two repairs, a stricter approval rule) are tested offline only. No run since has been made. |
| Verification pass over cited pages | Dropped for now (the quote check proves the words are on the page, not that the claim reads them correctly) |
| Composio managed-auth lookup | Built; tested against a fake server only. The response shape comes from Composio's docs and is unchecked against a live call |
| Saving a generated guide at a shareable URL; Composio auth-config creation and Connect Link test | Not built |

Search and fetch use **only Anthropic's server tools** through the Messages API (`web_search` for finding URLs, `web_fetch` for reading pages), called with the Anthropic SDK directly. Details and limits are in [AGENT_DESIGN.md](docs/AGENT_DESIGN.md#anthropic-tools-only). A spike confirmed the full page text is readable and that truncation has no flag, so the pipeline sets an explicit `max_content_tokens` and infers truncation (see AGENT_DESIGN.md). Run it with `ANTHROPIC_API_KEY=... npx tsx scripts/spike-fetch.ts`.

## Library guides

| App | Why it is in the set | Verdict | Status |
|---|---|---|---|
| GitHub | No review; org-owner approval is the only gate | Easy; under 1 day | **Done**: 19 claims, 7 sources |
| Gmail (Google) | Sensitive and restricted scopes, verification, annual third-party security assessment | Hard; about 6 weeks or more for restricted scopes | **Done**: 30 claims, 14 sources, 45 quotes checked |
| Slack | Instant for your own workspace; Marketplace review only for distribution | Moderate; under 1 day unlisted, up to about 12 weeks more for a listing | **Done**: 20 claims, 11 sources, 31 quotes checked |
| Notion | Public integration with required legal pages | Not in the library | Left to run live from the prototype and check |
| LinkedIn | Approval-gated access; the provider decides | Not in the library | Left to run live from the prototype and check |

## What was checked

**GitHub guide, 2026-11-03.** Six GitHub docs pages were fetched and read (creating, modifying and authorizing OAuth apps; scopes; org access restrictions; GitHub Apps vs OAuth apps), plus Composio docs read on 2026-10-30. No OAuth app was registered and no Composio API call was made, so **no claim is `verified`**.

- **Sourced (15 claims):** the registration form and its navigation path, the 10-callback and 100-app limits, the authorize and token URLs, PKCE (S256 only), token expiry (non-expiring by default; 8 hours if opted in), runtime scopes, org OAuth app restrictions, redirect-URL matching and wildcard rules, the GitHub Apps comparison, and the 5,000 requests-per-hour limit. Each quote was matched against the raw page text.
- **Marked `uncertain`, with notes (4 claims):** that GitHub has no review step (absence from four pages searched in full, not a statement by GitHub); where the client secret is generated (not described on these pages); the Composio setup steps (cited to the directory page, not the exact page); and the effort estimate (an agent estimate, not a measured time).
- **Left open:** whether non-loopback http callbacks are accepted, whether Basic auth works on the token endpoint (the page mentions Basic auth only for the REST API), and whether `github` is on Composio's managed-auth list.
- **Not in the library:** Notion and LinkedIn have no guide yet; they are the live-generation checks.

**Gmail (Google) guide, 2026-11-03.** Fourteen Google pages (verification help center and FAQ, sensitive and restricted scope verification, Gmail scopes, the web server flow, token expiry, app audience, unverified apps, data access, clients, submission steps, and the App Defense Alliance CASA page) were fetched in full with Anthropic's web_fetch tool, none truncated. Every evidence quote (45) was matched against the raw text. No project, consent screen or submission was attempted, so **no claim is `verified`**.

- **Sourced (27 claims),** including the timings: brand verification 2-3 business days, sensitive scopes up to 10 days (FAQ: 10 business days), restricted scopes about 6 weeks (docs: "several weeks"), all described by Google as estimates that are not guaranteed.
- **Corrected from the earlier hand-written (recalled) prototype entry:** `gmail.metadata` is a *restricted* scope, not a lighter option; the 100-user figures are on the app audience page (100 test users in Testing; 100 new users in total past the unverified app screen); the 7-day refresh-token expiry applies to external apps in Testing unless only basic profile scopes are requested; restricted verification includes an annual third-party assessment under CASA.
- **Marked `uncertain` (3 claims):** PKCE on the web server flow (the page does not mention it); the effort and total-time estimate (an agent estimate); the Composio steps (cited to the directory page).
- **Left open:** CASA cost and effort, real elapsed time, and whether Composio's managed Google app already covers your use.

**Slack guide, 2026-11-03.** Ten Slack pages (installing with OAuth, distribution, Marketplace guidelines, review guide and submission, the May 2025 rate-limit changelog, token rotation, PKCE, app approval help article, app settings quickstart) were fetched in full, none truncated; one scope reference page failed to fetch. Every evidence quote (31) was matched against the raw text. No app was created or submitted, so **no claim is `verified`**.

- **Sourced (17 claims),** including Marketplace review: preliminary feedback up to 10 business days, then a functional review of up to 10 weeks for new submissions and 6 weeks for resubmitted published apps, with the queue position reset on each resubmission; and that unlisted distribution is not reviewed.
- **Verdict differs from the lock list's guess:** the lock list had "hard". The docs show unlisted distribution is self-serve and unreviewed, so the guide says **moderate**, with the real costs being lower rate limits on conversation-history methods for unlisted commercial apps and Slack's statement that commercially distributed apps should be Marketplace-listed.
- **Marked `uncertain` (3 claims):** the effort estimate, the Composio steps, and what `chat:write` grants (the scope reference page could not be fetched).
- **Left open:** what each scope grants, whether the current rate-limits page repeats the changelog, and actual review times.

## What the live runs showed

Three real runs of `npm run generate -- "HubSpot"` (Sonnet 5.5, after the Composio key and a valid Anthropic key were set). HubSpot was chosen so Notion and LinkedIn stay untouched for the live checks. Costs are priced from published rates, not read from billing.

| Run | Result | Cost | Time | What happened |
|---|---|---|---|---|
| 1 | Complete | $0.349 | 48 s | 102k tokens in, 11.5k out; 6 calls, 3 searches, 7 pages. 47 sourced and 2 uncertain claims. No repair needed. |
| 2 | Incomplete | $0.359 | 54 s | After a prompt change. The reply came back unusable, repair could not recover it, and the raw reply was not captured, so the cause is unknown. |
| 3 | Incomplete | $0.508 | 52 s | The model used an invalid step stage. Spending had passed the cap (then $0.50, now $0.60), so no repair was allowed. |

**What we found**
- **The model overclaimed that a review was required.** In run 1 it marked HubSpot's Marketplace listing review as *required*, which made the verdict "hard" with a 14-62 day total, while its own open questions said the sources did not say a listing is needed to use the app. The review times themselves (10 business days, then no more than 60 days from feedback) were sourced. Fix: the assemble prompt now says a path is `required` only if a claim says the app cannot be used by real users without it, and never "out of caution", and that "hard" or "gated" needs a required path. In run 3 the model then rated it "moderate" with the review as optional. That is one observation, not a proof.
- **The model drifts on enum words** (a step stage of "listing" instead of "approval"). Fix: obvious cases are now normalized in code before validation rather than spending a repair call; unclear values still go to repair.
- **The original $0.50 cap was too tight, so it is now $0.60.** Runs cost $0.35, $0.36 and $0.51. Discovery alone varied from $0.11 to $0.19, and parallel page reads can overshoot the cap slightly (run 3 ended 1.5% over, which can still happen at $0.60). Fixes so far: at most 6 pages read, two repair tries, and repairs no longer blocked by the 80% soft limit. Raising the cap to around $0.75 is the other option and is a decision for the owner.
- **A failed run used to hide its cause.** Failures now keep a snippet of the model's raw reply, and the repair call is given the model's own unparseable text instead of `{}`.
- **Composio's managed-auth lookup works live.** For HubSpot it returned the OAUTH2 scheme, so the guide says a managed app exists and you may not need your own. This confirmed the response field the code reads.
- **Claim status held up.** 47 of 49 claims were `sourced` because their quotes were found verbatim on official pages; the two `uncertain` ones were the Composio steps and the effort estimate, as designed.

**Still not verified:** whether the generated HubSpot guide is correct against HubSpot's real console (nobody registered an app), how often live runs complete after the fixes, and Notion and LinkedIn, which are the intended manual checks.

## Limitations

- Only three real runs have been made, all on HubSpot, with costs of $0.35 to $0.51, so the $0.60 cap is tuned to very little data. Live guides are not saved or shareable yet.
- The public endpoint is protected only by an in-memory per-IP limit and the cost cap; it needs real rate limiting before being exposed.
- "Official source" is decided by a domain heuristic (the page's domain must start with the provider's name, or be the URL the user typed), so a lookalike domain could be mistaken for official.
- The recorded research cost of the Gmail and Slack guides covers only the page fetches (priced from published rates, not billing). The web searches that found the pages and the hand assembly are not metered; GitHub's cost was not recorded.
- Live generation is capped at about $0.60 per guide and two repair tries, so an unfamiliar or sprawling provider may come back incomplete.
- Review durations are rarely published by providers. Where a figure comes only from forum posts or third-party blogs, the guide labels it as anecdotal.
- No provider approvals were attempted, and no paid accounts were used.
- Provider consoles change. Each guide records the date it was last checked.
- The agent can read public documentation. It cannot see behind provider logins, so anything that exists only in a logged-in console is marked unverified.
