import { z } from "zod";
import { callModel, type ModelClient } from "./anthropic";
import type { Budget } from "./config";
import type { UsageTracker } from "./budget";
import { parseWith } from "./json";
import { DISCOVER_SYSTEM, discoverUser } from "./prompts/discover";
import type { Resolved } from "./resolve";

export const TOPICS = ["registration", "flow", "scopes", "review", "limits"] as const;
export type Topic = (typeof TOPICS)[number];

const DiscoverSchema = z.object({
  provider: z.object({
    name: z.string().min(1),
    website: z.string(),
    developerPortalUrl: z.string().optional(),
    officialDomains: z.array(z.string()).max(8).default([]),
  }),
  pages: z.array(z.object({ topic: z.enum(TOPICS), url: z.string(), title: z.string().default("") })).max(16),
  notes: z.string().optional(),
});
export type Discovered = z.infer<typeof DiscoverSchema>;

/** Stage 2: find candidate pages with the web_search tool. The model only proposes URLs; code filters them. */
export async function discover(opts: {
  client: ModelClient;
  tracker: UsageTracker;
  model: string;
  budget: Budget;
  resolved: Resolved;
}): Promise<Discovered> {
  const { client, tracker, model, budget, resolved } = opts;
  const maxSearches = Math.min(4, tracker.remainingSearches());
  if (maxSearches < 1) throw new Error("No web searches left in the budget.");
  const call = await callModel({
    client,
    tracker,
    stage: "discover",
    params: {
      model,
      max_tokens: budget.maxOutputTokensPerCall,
      system: DISCOVER_SYSTEM,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
      messages: [{ role: "user", content: discoverUser(resolved, Math.min(10, budget.maxFetches)) }],
    },
  });
  const parsed = parseWith(DiscoverSchema, call.text);
  if (!parsed.ok) throw new Error(`Discovery returned unusable output: ${parsed.errors.join("; ")}`);
  return parsed.value;
}
