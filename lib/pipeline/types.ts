import type { Claim, Guide, Source } from "../guide-schema";
import type { Budget } from "./config";
import type { StageUsage } from "./budget";

export type StageName = "resolve" | "discover" | "composio" | "extract" | "claim" | "assemble" | "validate" | "repair";

/** What the budget tracker has recorded so far. Safe to send to the browser. */
export type UsageSnapshot = {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  searches: number;
  fetches: number;
  elapsedMs: number;
  stages: Record<string, StageUsage>;
  budget: Budget;
};

export type PipelineEvent =
  | { type: "stage"; stage: StageName; status: "start" | "done" | "skipped"; detail?: string }
  | { type: "usage"; usage: UsageSnapshot }
  | { type: "done"; result: PipelineResult };

export type PipelineResult =
  | { status: "library"; guide: Guide; usage: UsageSnapshot }
  | { status: "complete"; guide: Guide; usage: UsageSnapshot; warnings: string[] }
  | {
      status: "incomplete";
      reason: string;
      errors: string[];
      claims: Claim[];
      sources: Source[];
      draft?: unknown;
      usage: UsageSnapshot;
    };
