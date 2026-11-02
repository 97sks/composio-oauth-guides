/**
 * Spike: what does Anthropic's web_fetch tool actually return?
 * Answers, from a real call:
 *   1. Is the full page text in the tool-result block, readable by our code?
 *   2. What happens on long pages: is truncation visible, and where is the cut?
 *   3. Does a quote check against the raw text work (and reject a made-up quote)?
 *
 * Run: ANTHROPIC_API_KEY=... npx tsx scripts/spike-fetch.ts [url]
 * Model: SPIKE_MODEL (default claude-opus-5-5). The model's own reply is ignored;
 * we only read the tool-result blocks.
 */
import Anthropic from "@anthropic-ai/sdk";
import { estimateTokens, extractFetchResults, looksTruncated, quoteInPage } from "../lib/pipeline/fetch";

const URL_ = process.argv[2] ?? "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps";
const MODEL = process.env.SPIKE_MODEL ?? "claude-opus-5-5";

// A phrase from near the top, one from the far end of the page, and one that is not on it.
const PROBES = {
  head: "The temporary code will expire after 10 minutes",
  tail: "bad_refresh_token",
  fake: "GitHub reviews every OAuth app within five business days",
};

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("No credentials. Set ANTHROPIC_API_KEY, or run `ant auth login`, then re-run.");
  process.exit(1);
}

const client = new Anthropic();

async function fetchOnce(maxContentTokens: number | null) {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Fetch ${URL_} with the web_fetch tool, then reply with only the word DONE.` },
  ];
  const blocks: Anthropic.ContentBlock[] = [];
  let last: Anthropic.Message | undefined;
  for (let turn = 0; turn < 3; turn++) {
    last = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools: [
        {
          type: "web_fetch_20250910",
          name: "web_fetch",
          max_uses: 1,
          ...(maxContentTokens != null ? { max_content_tokens: maxContentTokens } : {}),
        },
      ],
      messages,
    });
    blocks.push(...last.content);
    if (last.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: last.content }); // continue a paused server-tool turn unchanged
  }
  return { blocks, last: last! };
}

async function main() {
  for (const limit of [null, 100_000, 2_000]) {
    console.log(`\n=== max_content_tokens = ${limit ?? "(not set)"} ===`);
    const { blocks, last } = await fetchOnce(limit);
    const { pages, problems } = extractFetchResults(blocks);
    console.log("stop_reason:", last.stop_reason, "| input_tokens:", last.usage.input_tokens, "| server_tool_use:", JSON.stringify(last.usage.server_tool_use));
    if (problems.length) console.log("problems:", JSON.stringify(problems));

    const raw = blocks.find((b) => b.type === "web_fetch_tool_result");
    if (raw && raw.type === "web_fetch_tool_result" && raw.content.type === "web_fetch_result") {
      console.log("result keys:", Object.keys(raw.content).join(","), "| document keys:", Object.keys(raw.content.content).join(","));
    }

    for (const p of pages) {
      console.log("url:", p.url, "| retrieved_at:", p.retrievedAt);
      console.log("chars:", p.text.length, "| est tokens:", estimateTokens(p.text), "| looksTruncated:", looksTruncated(p.text, limit));
      console.log("explicit marker in text (/truncat/i):", /truncat/i.test(p.text));
      console.log("head probe found:", quoteInPage(p, PROBES.head), "| tail probe found:", quoteInPage(p, PROBES.tail), "| fake probe found:", quoteInPage(p, PROBES.fake));
      console.log("first 100:", JSON.stringify(p.text.slice(0, 100)));
      console.log("last 100: ", JSON.stringify(p.text.slice(-100)));
    }
  }
  console.log("\nRead: if char count shrinks with the limit and no field or marker says so, truncation is invisible and the heuristic is needed.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
