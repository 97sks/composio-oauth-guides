import Anthropic from "@anthropic-ai/sdk";
import type { UsageTracker } from "./budget";

/** The slice of the SDK the pipeline uses, so tests can pass a fake. */
export type ModelClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

export function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export type CallResult = {
  /** Every content block across all turns, in order (tool results included). */
  blocks: Anthropic.ContentBlock[];
  /** Text of the final assistant message only. */
  text: string;
};

/**
 * One logical model call. Checks the budget before each request, records usage after it,
 * and continues a turn the API paused (server tools can return stop_reason "pause_turn").
 */
export async function callModel(opts: {
  client: ModelClient;
  tracker: UsageTracker;
  stage: string;
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, "messages"> & { messages: Anthropic.MessageParam[] };
  maxContinuations?: number;
}): Promise<CallResult> {
  const { client, tracker, stage } = opts;
  const messages = [...opts.params.messages];
  const blocks: Anthropic.ContentBlock[] = [];
  let last: Anthropic.Message | undefined;
  for (let turn = 0; turn <= (opts.maxContinuations ?? 3); turn++) {
    tracker.assertWithin();
    last = await client.messages.create({ ...opts.params, messages });
    tracker.record(stage, last.usage);
    blocks.push(...last.content);
    if (last.stop_reason === "refusal") throw new Error(`The model declined the ${stage} request.`);
    if (last.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: last.content });
  }
  if (!last) throw new Error("No response from the model.");
  if (last.stop_reason === "max_tokens") throw new Error(`The ${stage} reply was cut off at the output limit.`);
  const text = last.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  return { blocks, text };
}
