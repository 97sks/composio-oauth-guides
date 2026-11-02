/**
 * Fetch pages with Anthropic's web_fetch tool and save the raw text to a folder,
 * so claims can be quote-checked against what the pages actually say.
 * Run: ANTHROPIC_API_KEY=... npx tsx scripts/fetch-pages.ts <outDir> <url> [url...]
 * Writes <outDir>/NN-host-path.txt and <outDir>/index.tsv; prints size, truncation guess and cost.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UsageTracker } from "../lib/pipeline/budget";
import { DEFAULT_BUDGET, MODEL } from "../lib/pipeline/config";
import { estimateTokens, extractFetchResults, looksTruncated } from "../lib/pipeline/fetch";

const [outDir, ...urls] = process.argv.slice(2);

async function main() {
  if (!outDir || urls.length === 0) {
    console.error("Usage: npx tsx scripts/fetch-pages.ts <outDir> <url> [url...]");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("No credentials. Set ANTHROPIC_API_KEY, or run `ant auth login`, then re-run.");
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const client = new Anthropic();
  // Research runs are not a live guide, so the per-guide cap does not apply; usage is still totalled.
  const tracker = new UsageTracker({ ...DEFAULT_BUDGET, maxCostUsd: 100, maxFetches: 1000, maxMillis: 10 * 60_000 });
  const limit = DEFAULT_BUDGET.maxContentTokens;
  const rows: string[] = ["n\turl\tchars\test_tokens\tlooks_truncated\tretrieved_at\tfile"];

  await Promise.all(
    urls.map(async (url, i) => {
      const n = String(i + 1).padStart(2, "0");
      try {
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: 2000,
          tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1, max_content_tokens: limit }],
          messages: [{ role: "user", content: `Fetch ${url} with the web_fetch tool, then reply with only the word DONE.` }],
        });
        tracker.record("fetch", res.usage);
        const { pages, problems } = extractFetchResults(res.content);
        if (!pages[0]) {
          console.log(`[${n}] FAILED ${url} ${JSON.stringify(problems)}`);
          rows.push(`${n}\t${url}\tFAILED\t\t\t\t`);
          return;
        }
        const p = pages[0];
        const u = new URL(p.url);
        const file = `${n}-${u.hostname}${u.pathname}`.replace(/[^a-zA-Z0-9.-]+/g, "_").slice(0, 90) + ".txt";
        writeFileSync(join(outDir, file), p.text);
        const trunc = looksTruncated(p.text, limit);
        console.log(`[${n}] ${p.text.length} chars (~${estimateTokens(p.text)} tok) truncated=${trunc} retrieved=${p.retrievedAt}  ${url}`);
        rows.push(`${n}\t${p.url}\t${p.text.length}\t${estimateTokens(p.text)}\t${trunc}\t${p.retrievedAt}\t${file}`);
      } catch (e) {
        console.log(`[${n}] ERROR ${url} ${e instanceof Error ? e.message : e}`);
        rows.push(`${n}\t${url}\tERROR\t\t\t\t`);
      }
    }),
  );
  writeFileSync(join(outDir, "index.tsv"), rows.join("\n") + "\n");
  const t = tracker.total;
  console.log(`\nTotal: ${t.calls} calls, ${t.inputTokens} input tokens, ${t.outputTokens} output tokens, about $${t.costUsd.toFixed(3)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
