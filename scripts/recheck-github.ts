/**
 * Re-check the open GitHub claims against the full raw page text.
 * Run: ANTHROPIC_API_KEY=... npx tsx scripts/recheck-github.ts
 * Prints matching excerpts for each open question; it changes no files.
 */
import Anthropic from "@anthropic-ai/sdk";
import { estimateTokens, extractFetchResults, looksTruncated, normalize } from "../lib/pipeline/fetch";

const MODEL = process.env.SPIKE_MODEL ?? "claude-sonnet-5-5";
const LIMIT = 100_000;
const BASE = "https://docs.github.com/en";
const PAGES: Record<string, string> = {
  creating: `${BASE}/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app`,
  modifying: `${BASE}/apps/oauth-apps/maintaining-oauth-apps/modifying-an-oauth-app`,
  authorizing: `${BASE}/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps`,
  restrictions: `${BASE}/organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions`,
};

// What to look for, per open claim. Patterns are searched in every page.
const CHECKS: { claim: string; what: string; pattern: RegExp }[] = [
  { claim: "c4", what: "limit on number of OAuth apps", pattern: /up to \d+ OAuth apps|\b100 OAuth apps/i },
  { claim: "c15", what: "wildcard / exact-match redirect rule", pattern: /wildcard|exactly match/i },
  { claim: "c15", what: "August 2026 wildcard change", pattern: /August 3, 2026/i },
  { claim: "c15", what: "loopback / localhost advice", pattern: /127\.0\.0\.1|localhost/i },
  { claim: "c17", what: "Basic auth on token endpoint", pattern: /basic auth|HTTP Basic|Authorization: Basic/i },
  { claim: "c18", what: "client secret generation / rotation", pattern: /generate a new client secret|new client secret|client secret.{0,60}(regenerat|rotat|delete)/i },
  { claim: "open", what: "plain http callback", pattern: /http:\/\//i },
  { claim: "c12", what: "any review / approval wording (absence check)", pattern: /\b(review|reviewed|approve[sd]?|approval|verif(y|ied|ication))\b/i },
];

async function fetchPage(client: Anthropic, url: string) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    tools: [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 1, max_content_tokens: LIMIT }],
    messages: [{ role: "user", content: `Fetch ${url} with the web_fetch tool, then reply with only the word DONE.` }],
  });
  return extractFetchResults(res.content);
}

function excerpts(text: string, pattern: RegExp, max = 3): string[] {
  const flat = normalize(text);
  const out: string[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (const m of flat.matchAll(re)) {
    const i = m.index ?? 0;
    out.push("…" + flat.slice(Math.max(0, i - 90), i + 130) + "…");
    if (out.length >= max) break;
  }
  return out;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error("No credentials. Set ANTHROPIC_API_KEY, or run `ant auth login`, then re-run.");
    process.exit(1);
  }
  const client = new Anthropic();
  const texts = new Map<string, string>();
  await Promise.all(
    Object.entries(PAGES).map(async ([name, url]) => {
      const { pages, problems } = await fetchPage(client, url);
      if (!pages[0]) return console.log(`[${name}] FAILED`, JSON.stringify(problems));
      texts.set(name, pages[0].text);
      console.log(`[${name}] ${pages[0].text.length} chars, ~${estimateTokens(pages[0].text)} tokens, looksTruncated=${looksTruncated(pages[0].text, LIMIT)}, retrieved_at=${pages[0].retrievedAt}`);
    }),
  );
  for (const c of CHECKS) {
    console.log(`\n--- ${c.claim}: ${c.what}`);
    let any = false;
    for (const [name, text] of texts) {
      const hits = excerpts(text, c.pattern);
      if (hits.length) any = true;
      for (const h of hits) console.log(`  [${name}] ${h}`);
    }
    if (!any) console.log("  (no match in any page)");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
