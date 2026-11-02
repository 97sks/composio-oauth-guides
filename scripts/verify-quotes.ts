/**
 * Check every evidence quote of a guide against the saved raw page text.
 * Run: npx tsx scripts/verify-quotes.ts <guide: gmail|slack> <pagesDir> [pagesDir...]
 * Each pagesDir is an output folder of scripts/fetch-pages.ts (it contains index.tsv).
 * A passing quote proves the words are on the cited page, not that the claim reads them correctly.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { googleEvidence, googleGuide } from "../lib/guides/google";
import { slackEvidence, slackGuide } from "../lib/guides/slack";
import { normalize } from "../lib/pipeline/fetch";

const [name, ...dirs] = process.argv.slice(2);
const guides = { gmail: [googleGuide, googleEvidence], slack: [slackGuide, slackEvidence] } as const;

function loadPages(): Map<string, string> {
  const byUrl = new Map<string, string>();
  for (const dir of dirs) {
    const index = join(dir, "index.tsv");
    if (!existsSync(index)) continue;
    for (const line of readFileSync(index, "utf8").split("\n").slice(1)) {
      const [, url, chars, , , , file] = line.split("\t");
      if (!url || chars === "FAILED" || chars === "ERROR" || !file) continue;
      byUrl.set(url, normalize(readFileSync(join(dir, file), "utf8")));
    }
  }
  return byUrl;
}

function main() {
  const entry = guides[name as keyof typeof guides];
  if (!entry || dirs.length === 0) {
    console.error("Usage: npx tsx scripts/verify-quotes.ts <gmail|slack> <pagesDir> [pagesDir...]");
    process.exit(1);
  }
  const [guide, evidence] = entry;
  const pages = loadPages();
  const urlOf = new Map(guide.sources.map((s) => [s.id, s.url]));
  let bad = 0;
  for (const e of evidence) {
    const url = urlOf.get(e.sourceId);
    const text = url ? pages.get(url) ?? pages.get(url.replace(/\/$/, "")) ?? pages.get(url + "/") : undefined;
    const ok = text ? text.includes(normalize(e.quote)) : false;
    if (!ok) {
      bad++;
      console.log(`MISSING ${e.claimId} [${e.sourceId}] ${text ? "quote not on page" : "page not loaded"}: ${e.quote.slice(0, 90)}`);
    }
  }
  // Every claim marked "sourced" needs at least one quote.
  const quoted = new Set(evidence.map((e) => e.claimId));
  for (const c of guide.claims) {
    if (c.status === "sourced" && !quoted.has(c.id)) {
      bad++;
      console.log(`NO QUOTE ${c.id} is "sourced" but has no evidence quote: ${c.text.slice(0, 80)}`);
    }
  }
  console.log(`${evidence.length} quotes checked across ${guide.claims.length} claims: ${bad === 0 ? "all present" : bad + " problem(s)"}`);
  process.exit(bad === 0 ? 0 : 1);
}
main();
