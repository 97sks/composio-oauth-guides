/** Offline tests for the per-guide budget cap. Run: npx tsx tests/budget.test.ts */
import assert from "node:assert/strict";
import { BudgetExceededError, UsageTracker, costOf } from "../lib/pipeline/budget";
import { DEFAULT_BUDGET } from "../lib/pipeline/config";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

// Defaults.
assert.equal(DEFAULT_BUDGET.maxCostUsd, 0.5);
assert.equal(DEFAULT_BUDGET.maxRepairTries, 1);
const d1 = new UsageTracker(DEFAULT_BUDGET, () => 0);
assert.equal(d1.mayRepair(0), true);
assert.equal(d1.mayRepair(1), false); // one repair try only

// Cost: 100k in + 10k out = $0.20 + $0.10; searches at $0.01 each; cache reads at $0.20/M.
near(costOf({ inputTokens: 100_000, outputTokens: 10_000, cacheReadTokens: 0, cacheWriteTokens: 0, searches: 0 }), 0.3);
near(costOf({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0, searches: 3 }), 0.23);

// Per-stage and total accounting; null cache fields and missing server_tool_use are fine.
let clock = 0;
const t = new UsageTracker({ ...DEFAULT_BUDGET, maxCostUsd: 1.0 }, () => clock);
t.record("discover", { input_tokens: 10_000, output_tokens: 1_000, server_tool_use: { web_search_requests: 3, web_fetch_requests: 0 } } as never);
t.record("extract", { input_tokens: 90_000, output_tokens: 6_000, cache_read_input_tokens: null, server_tool_use: { web_search_requests: 0, web_fetch_requests: 7 } } as never);
t.record("extract", { input_tokens: 20_000, output_tokens: 1_000 } as never);
const s = t.summary();
assert.equal(s.stages.extract.calls, 2);
assert.equal(s.stages.extract.inputTokens, 110_000);
assert.equal(s.total.searches, 3);
assert.equal(s.total.fetches, 7);
near(s.total.costUsd, (120_000 * 2 + 8_000 * 10) / 1e6 + 0.03); // 0.32 + 0.03
assert.equal(t.remainingSearches(), 3);
assert.equal(t.remainingFetches(), 5);
assert.equal(t.exceeded(), null);
assert.doesNotThrow(() => t.assertWithin());

// Soft limit at 80% of the cost cap stops optional work; hard cap stops everything.
const u = new UsageTracker({ ...DEFAULT_BUDGET, maxCostUsd: 0.5 }, () => clock);
assert.equal(u.softLimitReached(), false);
assert.equal(u.mayRepair(0), true);
u.record("assemble", { input_tokens: 150_000, output_tokens: 10_000 } as never); // $0.40 = 80%
assert.equal(u.softLimitReached(), true);
assert.equal(u.mayRepair(0), true); // the first try is always allowed
assert.equal(u.mayRepair(1), false); // retries are not
u.record("repair", { input_tokens: 50_000, output_tokens: 0 } as never); // +$0.10 = $0.50 = cap
assert.equal(u.exceeded(), "cost");
assert.equal(u.mayRepair(0), false);
assert.throws(() => u.assertWithin(), (e) => e instanceof BudgetExceededError && e.limit === "cost" && e.snapshot.total.costUsd >= 0.5);

// Repair tries are capped regardless of money.
const r = new UsageTracker({ ...DEFAULT_BUDGET, maxRepairTries: 3 }, () => clock);
assert.equal(r.mayRepair(2), true);
assert.equal(r.mayRepair(3), false);

// Wall-clock cap.
clock = 0;
const w = new UsageTracker({ ...DEFAULT_BUDGET, maxMillis: 1000 }, () => clock);
clock = 1001;
assert.equal(w.exceeded(), "time");

// Tool-use caps trip when exceeded.
const f = new UsageTracker({ ...DEFAULT_BUDGET, maxFetches: 2 }, () => 0);
f.record("extract", { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 0, web_fetch_requests: 3 } } as never);
assert.equal(f.exceeded(), "fetches");
assert.equal(f.remainingFetches(), 0);

console.log("budget cap: all checks passed");
