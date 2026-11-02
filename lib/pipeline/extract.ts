import { z } from "zod";
import { callModel, type ModelClient } from "./anthropic";
import type { Budget } from "./config";
import type { UsageTracker } from "./budget";
import type { Fact, PageWithFlags } from "./claim";
import type { Topic } from "./discover";
import { extractFetchResults, looksTruncated } from "./fetch";
import { parseWith } from "./json";
import { EXTRACT_SYSTEM, extractUser } from "./prompts/extract";

const ExtractSchema = z.object({
  facts: z.array(z.object({ field: z.string(), text: z.string().min(1), url: z.string(), quote: z.string() })).max(60),
});

/**
 * Stages 3 and 4 for one topic: one call with web_fetch enabled. The page text is taken from the
 * tool-result blocks (never the model's description), so the claim stage can check quotes against it.
 */
export async function extractTopic(opts: {
  client: ModelClient;
  tracker: UsageTracker;
  model: string;
  budget: Budget;
  topic: Topic;
  urls: string[];
}): Promise<{ facts: Fact[]; pages: PageWithFlags[]; problems: string[] }> {
  const { client, tracker, model, budget, topic, urls } = opts;
  const maxUses = Math.min(urls.length, tracker.remainingFetches());
  if (maxUses < 1) return { facts: [], pages: [], problems: [`${topic}: no page fetches left in the budget`] };
  const call = await callModel({
    client,
    tracker,
    stage: "extract",
    params: {
      model,
      max_tokens: budget.maxOutputTokensPerCall,
      system: EXTRACT_SYSTEM,
      output_config: { effort: "low" },
      tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: maxUses, max_content_tokens: budget.maxContentTokens }],
      messages: [{ role: "user", content: extractUser(topic, urls.slice(0, maxUses)) }],
    },
  });
  const { pages: fetched, problems } = extractFetchResults(call.blocks);
  const pages: PageWithFlags[] = fetched.map((p) => ({ ...p, truncated: looksTruncated(p.text, budget.maxContentTokens) }));
  const notes = problems.map((p) => `${topic}: fetch failed (${p.code})`);
  const parsed = parseWith(ExtractSchema, call.text);
  if (!parsed.ok) return { facts: [], pages, problems: [...notes, `${topic}: unusable extraction (${parsed.errors[0]})`] };
  return { facts: parsed.value.facts, pages, problems: notes };
}
