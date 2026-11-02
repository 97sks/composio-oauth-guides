# Guide Agent Design

How the agent turns "an app name or URL" into a schema-valid, cited setup guide ([lib/guide-schema.ts](../lib/guide-schema.ts)).

**Status.** Built in `lib/pipeline/` and exposed at `POST /api/generate`; tested offline with a scripted fake model. No real end-to-end run has been made yet. **Decided:** build as this fixed pipeline (stages are code; the model, via the Anthropic API, is called inside extract and assemble), not as a single autonomous tool loop. It is derived from one manual run, the GitHub guide ([lib/guides/github.ts](../lib/guides/github.ts)), where the steps below were done by hand with fetch subagents. Anything marked *proposed* is not in the schema yet.

## Models per stage

Decided: **`claude-sonnet-5-5` for every model call.** No Haiku, no separate verification pass. The ID lives in one config so it can be changed without touching stage code.

| Stage | Runs on |
|---|---|
| 1 Resolve | Code |
| 2 Discover | Sonnet (`web_search` tool) |
| 3 Fetch + 4 Extract | Sonnet (one call per topic with `web_fetch` as a tool inside it) |
| 5 Claim | **Code only**: quote check, source kind by domain, status by rule |
| 6 Assemble | Sonnet |
| 7 Validate | Code |
| 8 Repair (one try) | Sonnet |

## Principles

1. **Nothing is stated without a citation.** The schema rejects empty `claimIds` and `sourceIds`; the agent must never pad them to pass.
2. **Evidence status comes from provenance, by rule, not by judgment.** See the status rules below.
3. **Say where you stopped.** Untried steps are `not_tested`; unanswered questions go in `openQuestions`.
4. **Numbers are computed, not typed.** Counts, tallies and range flags are derived in code.
5. **The validator is the contract.** Generate, validate, repair; never hand-edit output to pass.

## Pipeline

```
 input (name | url)
   │
   ▼
 1 Resolve ──► 2 Discover ──► 3 Fetch ──► 4 Extract ──► 5 Claim ──► 6 Assemble ──► 7 Validate ──► guide
                                  ▲                                                     │
                                  └─────────────── 8 Repair (errors fed back) ◄─────────┘
```

| # | Stage | Input | Output | Notes from the GitHub run |
|---|---|---|---|---|
| 1 | **Resolve** | Name or URL | Provider, website, developer-portal URL, Composio toolkit slug (if any) | Check `GET /toolkits/{slug}` when a Composio key exists; else record `managedAuth: unknown` and a `not_tested` entry. |
| 2 | **Discover** | Provider | Ranked list of candidate doc pages per topic | Done from memory for GitHub. For unfamiliar providers this must be search plus the portal's own navigation. Topics: *create app*, *authorize/token flow*, *scopes*, *review/verification/publishing*, *org/admin approval*, *rate and app limits*, *GitHub-style alternatives* (e.g. "App vs OAuth app"). |
| 3 | **Fetch** | URLs | Pages: `{url, text, retrievedAt, truncated}` taken from the `web_fetch_tool_result` blocks | Fetch results were sometimes truncated or model-summarized. Code reads the raw text from the tool-result block, never the model's description of it, so `summarized` is false by construction. `truncated` is inferred (see Anthropic tools only). Prefer official domains; keep vendor and community pages labelled. |
| 4 | **Extract** | Excerpts + one question per schema field | Candidate facts with verbatim quotes | Field-shaped questions worked well (see "Questions per field"). Extraction returns quotes, not paraphrase. |
| 5 | **Claim** | Candidate facts | Numbered `claims[]` and `sources[]` with status | Done before any prose. Status by rule. |
| 6 | **Assemble** | Claims, sources, Composio template | Full `Guide` object | Prose is written from claims; steps, blockers and requirements reference claim IDs that already exist. |
| 7 | **Validate** | Guide | Pass, or list of issues | `GuideSchema.safeParse`. |
| 8 | **Repair** | Issues | Corrected guide | Feed validator messages back; one try, then return the draft with the failures listed. Not needed for GitHub, essential for live use. |

## Questions per field

Stage 4 asks each doc excerpt targeted questions that map onto schema fields. This is what produced usable results.

| Schema field | Question |
|---|---|
| `registration.*`, `requirements` | Exact console path; every form field and which are required; callback URL rules (exact match, http/https, localhost, count); what credentials are issued and how to rotate; limits on number of apps; who can own an app. |
| `scoping.declaredWhere`, `scopes` | Are scopes fixed in the console, sent in the authorize request, or both? Scope list with one-line meaning; which need review. |
| `approval[]` | Does any review, verification, publishing or admin approval exist? Trigger, official time estimate, recurring requirement, limits while unapproved. Search *explicitly* for review terms; do not infer from silence alone. |
| `execution` | Authorize and token URLs; PKCE (supported, required, which methods); how client credentials are sent; token lifetime; refresh behaviour; extra authorize parameters. |
| `blockers` | Rate limits, org restrictions, expiry traps, anything that silently breaks. |

## Status rules

Applied in code at stage 5, never decided at assembly.

| Condition | Status |
|---|---|
| Agent completed the action itself and a `tested[]` entry passed | `verified` |
| Verbatim quote from an **official** page, page not truncated at that point | `sourced` |
| Only vendor or community sources | `anecdotal` |
| Official source but excerpt was summarized or truncated before the quote | `uncertain`, note says why |
| Sources conflict, or the answer is absent from pages checked | `uncertain`, note names the pages checked |
| Agent's own estimate (effort, total time) | `uncertain`, note says "agent estimate", cites the claims it derives from |

Rules for waits: a figure is `official` only if an official page states it; forum or blog figures are `anecdotal`; no figure means `unpublished` and no number in the label. A required approval path with no upper bound makes `totalTime.openEnded` true.

## Computed, not written

Done by code after assembly, then checked against the model's values:

- claim and source counts, and the tally by status
- `totalTime.openEnded` from the approval paths
- `needsProviderApproval` from the approval paths
- the list of sources no claim cites (remove or cite)
- claim ID numbering and gaps (renumber)

In the GitHub run the status counts were first written from memory and were wrong (12/7 instead of 13/6). They must come from the data.

## What the agent does and does not do

| The agent can | A human must |
|---|---|
| Find and read docs; draft names, descriptions, justifications | Log in to the provider and accept legal terms |
| Compute least-privilege scopes, create the Composio auth config, run the Connect Link test | Pass identity or business verification |
| Draft the request text for an admin or reviewer | Submit for review, answer reviewers, wait |
| Mark what it could not check | Click through the consent screen |

Where the agent has no account or key, the matching `tested[]` entry is `not_tested` with the reason. It never fabricates a test.

## Proposed schema changes (not yet implemented)

1. **`quote` on claims.** A short verbatim excerpt. Required for `sourced`. Lets a checker confirm the quote appears on the cited page, which closes the biggest gap: today the schema checks that links exist, not that the page says what the claim says.
2. **Per-claim provenance:** `truncated` and `summarized` flags on the claim, so the UI and the status rule can see them.
3. **`testedIds` on `verified` claims.** Today any passed test lets any claim be `verified`.
4. **`waitClaimIds` on the verdict.** Today "wait is official" is satisfied by any sourced claim in the verdict.
5. **`pagesChecked` on negative claims** such as "no review exists", so the absence is auditable.

## Verification pass (dropped for now)

A second, independent model pass over each `sourced` claim was considered and **not** included. Consequence to state plainly: the code-side quote check proves the quoted words are on the cited page, but not that the claim means what the quote says. Guides should not claim more than that. Revisit if reviewers find claims that quote a page correctly but misread it.

## Budget cap per guide

Every guide generation runs under a budget ([lib/pipeline/config.ts](../lib/pipeline/config.ts), enforced by [lib/pipeline/budget.ts](../lib/pipeline/budget.ts)). The defaults below are a first guess, set just above the estimated cost of a typical guide (roughly $0.35-0.45, an estimate and not a measurement). Headroom is thin: a guide that needs many pages or a long assemble may hit the cap, and the soft limit (80%, $0.40) will stop extra work early. Tune them once real runs are logged.

| Limit | Default | What happens |
|---|---|---|
| Total cost | $0.50 | **Hard cap.** The run stops before the next model call and returns its partial result. |
| Soft limit | 80% of the cost cap ($0.40) | Optional work stops: no extra pages. |
| Web searches | 6 | Passed to `web_search` as `max_uses`, reduced by what earlier calls used. |
| Web fetches | 12 | Same, for `web_fetch`, summed across calls. |
| Content per page | 100,000 tokens | `max_content_tokens`; also how truncation is detected. |
| Output per call | 16,000 tokens | `max_tokens`. |
| Repair tries | 1 | One full model call. If it still fails validation, the draft is returned with the remaining errors listed. |
| Wall clock | 180 seconds | Whole run. |

How it works:

- A `UsageTracker` records each response's usage under a stage name (input, output including thinking, cache reads and writes, searches, fetches) and prices it from `PRICING`.
- Before every model call the pipeline calls `assertWithin()`. If a hard limit is hit it throws `BudgetExceededError`, carrying a snapshot of what was spent.
- Hitting a cap is not a failure to hide. The pipeline returns the guide it has, marked incomplete, with the reason added to `openQuestions` (for example "Stopped at the cost cap before checking scopes"). Claims already made keep their citations.
- The per-stage table (`summary()`) is shown in the run log, so spend is visible per guide.
- Prices in `PRICING` are copied from Anthropic's published rates as of 2026-11-03 and need re-checking.

## Open decisions

- **Live latency.** The GitHub fetch stage took about 30 seconds in parallel. A live run needs a time budget and a way to show progress; partial results should be shown as `uncertain` rather than withheld.
- **Caching.** Library guides are static; live guides could be cached by provider with `lastChecked`, and rechecked after a time limit.
- **Discovery for unfamiliar providers.** The least tested stage. Needs a search strategy and a stop rule (when are enough pages read).
- **Hands-on attempts.** How far an agent can go in registering an app without a human is unexplored; the GitHub run attempted none.

## Lessons from the GitHub run

- Targeted, field-shaped questions beat "summarize this page".
- Fetch output needs provenance flags; without them, status assignment is guesswork.
- Claims must exist before prose, or claim IDs get invented or orphaned.
- The validator found one bad rule (same-day totals rejected). Test validator rules against real guides.
- Absence of evidence is the weakest kind; it is allowed only as `uncertain`.
