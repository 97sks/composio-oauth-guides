import { z } from "zod";
import { DEFAULT_BUDGET, MODEL, type Budget } from "./pipeline/config";

/**
 * Typed, validated environment. Server-only: never import this from client code.
 * Next.js loads .env.local into process.env; scripts load it with `tsx --env-file=.env.local`.
 */
const Schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  COMPOSIO_API_KEY: z.string().min(1).optional(),
  PIPELINE_MODEL: z.string().min(1).default(MODEL),
  GUIDE_MAX_COST_USD: z.coerce.number().positive().max(10).default(DEFAULT_BUDGET.maxCostUsd),
  GUIDE_MAX_REPAIR_TRIES: z.coerce.number().int().min(0).max(3).default(DEFAULT_BUDGET.maxRepairTries),
  GENERATE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  GENERATE_RATE_LIMIT_PER_DAY: z.coerce.number().int().min(1).max(1000).default(3),
});

export type Env = z.infer<typeof Schema>;

/** Treat empty strings (as in a copied .env.example) as unset. */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  return Schema.parse(cleaned);
}

export function budgetFrom(env: Env): Budget {
  return { ...DEFAULT_BUDGET, maxCostUsd: env.GUIDE_MAX_COST_USD, maxRepairTries: env.GUIDE_MAX_REPAIR_TRIES };
}
