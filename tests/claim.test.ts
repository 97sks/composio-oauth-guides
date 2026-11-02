/** Offline tests for the claim stage and derived values. Run: npx tsx tests/claim.test.ts */
import assert from "node:assert/strict";
import { githubGuide } from "../lib/guides/github";
import { googleGuide } from "../lib/guides/google";
import { slackGuide } from "../lib/guides/slack";
import { buildClaims, negativeClaim, sourceKind, statusFor, type PageWithFlags } from "../lib/pipeline/claim";
import { deriveNeedsProviderApproval, deriveOpenEnded, deriveTotalTime, formatDays, orphanSourceIds, statusTally, uncitedClaimIds } from "../lib/pipeline/derive";

const domains = { official: ["github.com", "docs.github.com"], vendor: ["nango.dev"] };

// Source kind is decided by domain, including subdomains, and a lookalike does not pass.
assert.equal(sourceKind("https://docs.github.com/en/x", domains), "official");
assert.equal(sourceKind("https://nango.dev/docs", domains), "vendor");
assert.equal(sourceKind("https://github.com.evil.example/x", domains), "community");
assert.equal(sourceKind("https://notgithub.com/x", domains), "community");

// Status by rule.
assert.equal(statusFor("official", true).status, "sourced");
assert.equal(statusFor("official", false).status, "uncertain");
assert.equal(statusFor("vendor", true).status, "anecdotal");
assert.equal(statusFor("community", true).status, "anecdotal");

// buildClaims: quote found on an official page, quote missing, page never fetched.
const page = (url: string, text: string, truncated = false): PageWithFlags => ({ url, title: "T", text, retrievedAt: null, truncated });
const pages = [page("https://docs.github.com/a", "The temporary code will expire after 10 minutes. State is recommended.")];
const out = buildClaims(
  [
    { field: "execution", text: "Code expires in 10 minutes", url: "https://docs.github.com/a", quote: "The temporary code will expire after 10 minutes" },
    { field: "execution", text: "GitHub reviews apps", url: "https://docs.github.com/a", quote: "GitHub reviews every OAuth app within five days" },
    { field: "approval", text: "Never fetched", url: "https://docs.github.com/missing", quote: "anything long enough to count here" },
  ],
  pages,
  domains,
  "2026-11-03",
);
assert.deepEqual(out.claims.map((c) => c.status), ["sourced", "uncertain", "uncertain"]);
assert.deepEqual(out.claims.map((c) => c.id), ["c1", "c2", "c3"]);
assert.equal(out.sources.length, 2); // same URL reused across claims
assert.deepEqual(out.byField.get("execution"), ["c1", "c2"]);
assert.equal(out.claims[2].note, "Page was not fetched in this run.");

// A truncated page can still source a quote that survived; absence on it is never stronger than uncertain.
const neg = negativeClaim("No review step", [page("https://docs.github.com/a", "x", true)], () => "s1", "c9");
assert.equal(neg.status, "uncertain");
assert.match(neg.note ?? "", /\(truncated\)/);

// Derived values.
assert.equal(deriveNeedsProviderApproval([]), false);
assert.deepEqual(deriveTotalTime({ minHours: 0.5, maxHours: 1.5 }, []), { minDays: 0, maxDays: 1, openEnded: false });
const google = [
  { name: "a", appliesWhen: "", required: true, wait: { label: "", minDays: 3, maxDays: 5, basis: "anecdotal" as const }, interimLimits: [], claimIds: ["c1"] },
  { name: "b", appliesWhen: "", required: true, wait: { label: "", minDays: 14, maxDays: 28, basis: "official" as const }, interimLimits: [], claimIds: ["c1"] },
];
assert.deepEqual(deriveTotalTime({ minHours: 2, maxHours: 6 }, google), { minDays: 17, maxDays: 34, openEnded: false });
const unbounded = [{ ...google[0], wait: { label: "Not published", basis: "unpublished" as const } }];
assert.equal(deriveOpenEnded(unbounded), true);
assert.deepEqual(deriveTotalTime({ minHours: 2, maxHours: 6 }, unbounded), { minDays: 0, openEnded: true });
assert.equal(formatDays(0, 1), "Under 1 day");
assert.equal(formatDays(3, 5), "3-5 days");
assert.equal(formatDays(2), "At least 2 days; no upper bound published");

// The hand-written GitHub guide agrees with what code derives from its own data.
const g = githubGuide;
assert.equal(g.verdict.needsProviderApproval, deriveNeedsProviderApproval(g.approval));
const t = deriveTotalTime(g.verdict.effort, g.approval);
assert.equal(g.verdict.totalTime.minDays, t.minDays);
assert.equal(g.verdict.totalTime.maxDays, t.maxDays);
assert.equal(g.verdict.totalTime.openEnded, t.openEnded);
assert.deepEqual(statusTally(g.claims), { verified: 0, sourced: 15, anecdotal: 0, uncertain: 4 });
assert.deepEqual(orphanSourceIds(g), []);
console.log("uncited claims in github guide:", uncitedClaimIds(g).join(", ") || "none");

// Every library guide agrees with what code derives from its own data, and has no unused sources or claims.
for (const guide of [githubGuide, googleGuide, slackGuide]) {
  assert.equal(guide.verdict.needsProviderApproval, deriveNeedsProviderApproval(guide.approval), guide.slug);
  const d = deriveTotalTime(guide.verdict.effort, guide.approval);
  assert.equal(guide.verdict.totalTime.minDays, d.minDays, guide.slug + " minDays");
  assert.equal(guide.verdict.totalTime.maxDays, d.maxDays, guide.slug + " maxDays");
  assert.equal(guide.verdict.totalTime.openEnded, d.openEnded, guide.slug + " openEnded");
  assert.deepEqual(orphanSourceIds(guide), [], guide.slug + " orphan sources");
  assert.deepEqual(uncitedClaimIds(guide), [], guide.slug + " uncited claims");
  const tally = statusTally(guide.claims);
  console.log(guide.slug.padEnd(7), JSON.stringify(tally));
}

console.log("claim stage and derived values: all checks passed");
