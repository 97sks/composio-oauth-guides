/** One place for model and cost settings, so stage code never hard-codes them. */

export const MODEL = "claude-sonnet-5-5"; // every model call (see AGENT_DESIGN.md, Models per stage)

/** USD per million tokens, and per search. From Anthropic's published rates as of 2026-11-03; re-check before relying on them. */
export const PRICING = {
  inputPerMTok: 2.0,
  outputPerMTok: 10.0,
  cacheReadPerMTok: 0.2,
  cacheWritePerMTok: 2.5, // 1.25x input
  perSearch: 10 / 1000,
} as const;

/** Limits for generating ONE guide. A live run stops cleanly at the hard cap and returns what it has. */
export type Budget = {
  maxCostUsd: number; // hard cap on total spend
  softRatio: number; // at this fraction of the cost cap, stop optional work
  maxSearches: number; // passed to the web_search tool as max_uses
  maxFetches: number; // passed to the web_fetch tool as max_uses, summed across calls
  maxContentTokens: number; // web_fetch max_content_tokens (also how truncation is detected)
  maxOutputTokensPerCall: number; // max_tokens on each call
  maxRepairTries: number;
  maxMillis: number; // wall-clock limit for the whole run
};

/** Slightly above the estimated cost of a typical guide (~$0.35-0.45), so headroom is thin: a typical run fits, a runaway does not. */
export const DEFAULT_BUDGET: Budget = {
  maxCostUsd: 0.5,
  softRatio: 0.8,
  maxSearches: 6,
  maxFetches: 12,
  maxContentTokens: 100_000,
  maxOutputTokensPerCall: 16_000,
  maxRepairTries: 1,
  maxMillis: 180_000,
};
