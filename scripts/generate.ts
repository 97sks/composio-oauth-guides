/**
 * Run the whole pipeline from the command line.
 * Run: npm run generate -- "HubSpot"      (loads .env.local)
 * Prints stage progress, then usage per stage, then a summary of the result. Writes the result JSON
 * to the folder given by OUT_DIR if set.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { budgetFrom, readEnv } from "../lib/env";
import { createClient } from "../lib/pipeline/anthropic";
import { runPipeline } from "../lib/pipeline/run";

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run generate -- "<app name or website>"');
    process.exit(1);
  }
  const env = readEnv();
  if (!env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }
  const started = Date.now();
  const result = await runPipeline({
    query,
    client: createClient(env.ANTHROPIC_API_KEY),
    model: env.PIPELINE_MODEL,
    budget: budgetFrom(env),
    composio: env.COMPOSIO_API_KEY ? { apiKey: env.COMPOSIO_API_KEY } : undefined,
    onEvent: (e) => {
      if (e.type === "stage" && e.status !== "start") console.log(`  ${e.stage.padEnd(9)} ${e.status}${e.detail ? ": " + e.detail : ""}`);
      if (e.type === "stage" && e.status === "start") console.log(`> ${e.stage}`);
    },
  });
  const u = result.usage;
  console.log(`\nResult: ${result.status}${result.status === "incomplete" ? ` (${result.reason})` : ""} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`Cost $${u.costUsd.toFixed(4)} of $${u.budget.maxCostUsd} | ${u.inputTokens} in / ${u.outputTokens} out tokens | ${u.calls} calls, ${u.searches} searches, ${u.fetches} fetches`);
  for (const [stage, s] of Object.entries(u.stages)) console.log(`  ${stage.padEnd(9)} ${s.calls} call(s)  ${s.inputTokens} in  ${s.outputTokens} out  $${s.costUsd.toFixed(4)}`);
  if (result.status === "incomplete") result.errors.slice(0, 8).forEach((m) => console.log("  !", m));
  if (result.status === "complete") {
    const g = result.guide;
    const tally = g.claims.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {});
    console.log(`${g.name}: ${g.verdict.difficulty}, effort ${g.verdict.effort.label}, total ${g.verdict.totalTime.label}`);
    console.log(`${g.claims.length} claims ${JSON.stringify(tally)}, ${g.sources.length} sources, ${g.steps.length} steps`);
    result.warnings.forEach((w) => console.log("  warning:", w));
  }
  if (process.env.OUT_DIR) {
    mkdirSync(process.env.OUT_DIR, { recursive: true });
    const file = join(process.env.OUT_DIR, `${query.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(result, null, 2));
    console.log("Saved", file);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
