import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_BUDGET, PRICING, type Budget } from "./config";

/**
 * Tracks what one guide has cost so far and enforces the caps.
 * Policy: past the soft limit, skip optional work (more pages, repair retries);
 * past a hard limit, stop and let the pipeline return its partial result.
 */

export type StageUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  searches: number;
  fetches: number;
  costUsd: number;
};

export type BudgetLimit = "cost" | "searches" | "fetches" | "time" | "repairs";

export class BudgetExceededError extends Error {
  constructor(
    public readonly limit: BudgetLimit,
    public readonly snapshot: ReturnType<UsageTracker["summary"]>,
  ) {
    super(`Budget exceeded (${limit}): $${snapshot.total.costUsd.toFixed(3)} spent`);
    this.name = "BudgetExceededError";
  }
}

const empty = (): StageUsage => ({
  calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, searches: 0, fetches: 0, costUsd: 0,
});

export function costOf(u: Pick<StageUsage, "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "searches">): number {
  return (
    (u.inputTokens * PRICING.inputPerMTok +
      u.outputTokens * PRICING.outputPerMTok +
      u.cacheReadTokens * PRICING.cacheReadPerMTok +
      u.cacheWriteTokens * PRICING.cacheWritePerMTok) /
      1_000_000 +
    u.searches * PRICING.perSearch
  );
}

type UsageLike = Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> &
  Partial<Pick<Anthropic.Usage, "cache_read_input_tokens" | "cache_creation_input_tokens" | "server_tool_use">>;

export class UsageTracker {
  private stages = new Map<string, StageUsage>();
  private readonly startedAt: number;

  constructor(
    public readonly budget: Budget = DEFAULT_BUDGET,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }

  /** Record one response's usage under a stage name. Output tokens include thinking. */
  record(stage: string, usage: UsageLike): void {
    const s = this.stages.get(stage) ?? empty();
    s.calls += 1;
    s.inputTokens += usage.input_tokens;
    s.outputTokens += usage.output_tokens;
    s.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    s.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    s.searches += usage.server_tool_use?.web_search_requests ?? 0;
    s.fetches += usage.server_tool_use?.web_fetch_requests ?? 0;
    s.costUsd = costOf(s);
    this.stages.set(stage, s);
  }

  get total(): StageUsage {
    const t = empty();
    for (const s of this.stages.values()) {
      t.calls += s.calls; t.inputTokens += s.inputTokens; t.outputTokens += s.outputTokens;
      t.cacheReadTokens += s.cacheReadTokens; t.cacheWriteTokens += s.cacheWriteTokens;
      t.searches += s.searches; t.fetches += s.fetches;
    }
    t.costUsd = costOf(t);
    return t;
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  /** True once optional work should stop (extra pages, repair retries beyond the first). */
  softLimitReached(): boolean {
    return this.total.costUsd >= this.budget.maxCostUsd * this.budget.softRatio;
  }

  /** Budget left for tool `max_uses`, so a call cannot overshoot the search and fetch caps. */
  remainingSearches(): number {
    return Math.max(0, this.budget.maxSearches - this.total.searches);
  }
  remainingFetches(): number {
    return Math.max(0, this.budget.maxFetches - this.total.fetches);
  }

  /** Which hard limit is hit, if any. */
  exceeded(): BudgetLimit | null {
    const t = this.total;
    if (t.costUsd >= this.budget.maxCostUsd) return "cost";
    if (this.elapsedMs() >= this.budget.maxMillis) return "time";
    if (t.searches > this.budget.maxSearches) return "searches";
    if (t.fetches > this.budget.maxFetches) return "fetches";
    return null;
  }

  /** Call before starting each model call. Throws with a snapshot the pipeline can return. */
  assertWithin(): void {
    const limit = this.exceeded();
    if (limit) throw new BudgetExceededError(limit, this.summary());
  }

  /**
   * Whether another repair try is allowed. Repairs are cheap (a few cents) and turn a failed guide into a usable one,
   * so they are limited by the try count and the hard caps only, not by the soft limit.
   */
  mayRepair(triesSoFar: number): boolean {
    return triesSoFar < this.budget.maxRepairTries && !this.exceeded();
  }

  summary() {
    const stages = Object.fromEntries(this.stages);
    return { stages, total: this.total, elapsedMs: this.elapsedMs(), budget: this.budget };
  }
}
