import type { Claim, Guide, Source } from "../guide-schema";
import { findLibraryGuide } from "../guides";
import { assemble, mergeGuide, repair, validateGuide, type Assembled } from "./assemble";
import type { ModelClient } from "./anthropic";
import { BudgetExceededError, UsageTracker } from "./budget";
import { buildClaims, ensureSource, negativeClaim, type Fact, type PageWithFlags, type ProviderDomains } from "./claim";
import type { Budget } from "./config";
import { discover, TOPICS, type Discovered, type Topic } from "./discover";
import { buildProviderDomains, registrableDomain } from "./domains";
import { describeLookup, lookupToolkit, type ToolkitLookup } from "./composio";
import { extractTopic } from "./extract";
import { canonicalUrl } from "./fetch";
import { resolveQuery, slugify } from "./resolve";
import type { PipelineEvent, PipelineResult, StageName, UsageSnapshot } from "./types";

export function snapshot(tracker: UsageTracker): UsageSnapshot {
  const s = tracker.summary();
  return {
    costUsd: s.total.costUsd,
    inputTokens: s.total.inputTokens,
    outputTokens: s.total.outputTokens,
    calls: s.total.calls,
    searches: s.total.searches,
    fetches: s.total.fetches,
    elapsedMs: s.elapsedMs,
    stages: s.stages,
    budget: s.budget,
  };
}

function toRun(tracker: UsageTracker, model: string): NonNullable<Guide["run"]> {
  const s = snapshot(tracker);
  return {
    source: "pipeline",
    model,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    costUsd: Number(s.costUsd.toFixed(4)),
    stages: Object.entries(s.stages).map(([stage, u]) => ({
      stage,
      calls: u.calls,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      costUsd: Number(u.costUsd.toFixed(4)),
    })),
    note: "Metered from the API usage of every model call in this run (searches and page reads included), priced from published rates, not billing.",
  };
}

const TOPIC_PRIORITY: Topic[] = ["registration", "review", "flow", "scopes", "limits"];
const COMPOSIO_SOURCE: Source = {
  id: "s0",
  title: "Composio managed auth directory (Composio Docs)",
  url: "https://docs.composio.dev/toolkits/managed-auth",
  kind: "vendor",
  retrieved: "2026-10-30",
};
const COMPOSIO_CLAIM_TEXT =
  "With Composio, register https://backend.composio.dev/api/v3/toolkits/auth/callback as the provider redirect URI, create a use_custom_auth auth config with your client ID, secret and scopes, pass it as auth_configs in the session, and test with a Connect Link until the account is ACTIVE.";

export async function runPipeline(opts: {
  query: string;
  client: ModelClient;
  model: string;
  budget: Budget;
  onEvent?: (e: PipelineEvent) => void;
  /** Optional Composio lookup of managed auth; `fetch` is injectable for tests. */
  composio?: { apiKey: string; fetch?: typeof fetch };
  today?: string;
  now?: () => number;
}): Promise<PipelineResult> {
  const { client, model, budget } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const tracker = new UsageTracker(budget, opts.now);
  const emit = (e: PipelineEvent) => opts.onEvent?.(e);
  const stage = (s: StageName, status: "start" | "done" | "skipped", detail?: string) => {
    emit({ type: "stage", stage: s, status, detail });
    emit({ type: "usage", usage: snapshot(tracker) });
  };

  // Partial state, kept so a budget stop can still return what was found.
  let claims: Claim[] = [];
  let sources: Source[] = [];
  const finish = (r: PipelineResult) => {
    emit({ type: "done", result: r });
    return r;
  };
  const incomplete = (reason: string, errors: string[] = [], draft?: unknown): PipelineResult =>
    finish({ status: "incomplete", reason, errors, claims, sources, draft, usage: snapshot(tracker) });

  try {
    // 1 Resolve (code)
    stage("resolve", "start");
    const library = findLibraryGuide(opts.query);
    if (library) {
      stage("resolve", "done", `Library guide: ${library.name}`);
      return finish({ status: "library", guide: library, usage: snapshot(tracker) });
    }
    const resolved = resolveQuery(opts.query);
    stage("resolve", "done", `Not in the library; researching ${resolved.name}`);

    // 2 Discover (model + web_search)
    stage("discover", "start");
    let found: Discovered;
    try {
      found = await discover({ client, tracker, model, budget, resolved });
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      return incomplete("Discovery failed", [e instanceof Error ? e.message : String(e)]);
    }
    const provider = {
      name: found.provider.name,
      website: found.provider.website,
      developerPortalUrl: found.provider.developerPortalUrl,
    };
    const domains: ProviderDomains = buildProviderDomains({
      name: provider.name,
      userUrl: resolved.userUrl,
      website: provider.website,
      proposed: found.provider.officialDomains,
    });
    // Keep official https pages only, once each, in priority order, within the fetch budget.
    const seen = new Set<string>();
    let candidates = found.pages
      .filter((p) => {
        try {
          const u = new URL(p.url);
          return u.protocol === "https:" && domains.official.includes(registrableDomain(u.hostname));
        } catch {
          return false;
        }
      })
      .sort((a, b) => TOPIC_PRIORITY.indexOf(a.topic) - TOPIC_PRIORITY.indexOf(b.topic))
      .filter((p) => (seen.has(canonicalUrl(p.url)) ? false : (seen.add(canonicalUrl(p.url)), true)));
    if (tracker.softLimitReached()) candidates = candidates.filter((p) => p.topic === "registration" || p.topic === "review" || p.topic === "flow");
    candidates = candidates.slice(0, Math.min(budget.maxPages, tracker.remainingFetches()));
    const dropped = found.pages.length - candidates.length;
    stage("discover", "done", `${candidates.length} official page(s) to read${dropped > 0 ? `, ${dropped} skipped` : ""}`);
    if (candidates.length === 0) return incomplete("No official documentation pages were found", found.notes ? [found.notes] : []);

    // Composio toolkit lookup (no model, no tokens), run alongside extraction
    const lookupPromise: Promise<ToolkitLookup | undefined> = opts.composio
      ? lookupToolkit(slugify(provider.name), opts.composio.apiKey, opts.composio.fetch)
      : Promise.resolve(undefined);

    // 3+4 Fetch and extract (model + web_fetch), one call per topic, in parallel
    stage("extract", "start");
    const byTopic = new Map<Topic, string[]>();
    for (const p of candidates) byTopic.set(p.topic, [...(byTopic.get(p.topic) ?? []), p.url]);
    const settled = await Promise.allSettled(
      TOPICS.filter((t) => byTopic.has(t)).map((topic) =>
        extractTopic({ client, tracker, model, budget, topic, urls: byTopic.get(topic)! }),
      ),
    );
    const facts: Fact[] = [];
    const pages: PageWithFlags[] = [];
    const warnings: string[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") {
        facts.push(...r.value.facts);
        pages.push(...r.value.pages);
        warnings.push(...r.value.problems);
      } else if (r.reason instanceof BudgetExceededError) {
        throw r.reason;
      } else {
        warnings.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
    }
    stage("extract", "done", `${pages.length} page(s) read, ${facts.length} fact(s) proposed`);
    const lookup = await lookupPromise;
    const managed = describeLookup(lookup, today);
    if (opts.composio) stage("composio", "done", managed.note);

    // 5 Claim (code only)
    stage("claim", "start");
    const built = buildClaims(facts, pages, domains, today);
    const fieldOf = new Map<string, string>();
    for (const [field, ids] of built.byField) for (const id of ids) fieldOf.set(id, field);
    claims = built.claims;
    sources = built.sources;
    if (!facts.some((f) => f.field.startsWith("approval."))) {
      for (const p of pages) ensureSource(built, p, domains, today);
      sources = built.sources;
      if (pages.length > 0) {
        claims = [
          ...claims,
          negativeClaim(
            "No provider review, verification or approval requirement was found on the pages checked.",
            pages,
            (url) => built.sources.find((s) => canonicalUrl(s.url) === canonicalUrl(url))!.id,
            `c${claims.length + 1}`,
          ),
        ];
      }
    }
    if (claims.length === 0) return incomplete("No facts could be extracted from the pages", warnings);
    // The standard Composio claim, so steps about the auth config have something to cite.
    const composioSource: Source = { ...COMPOSIO_SOURCE, id: `s${sources.length + 1}` };
    sources = [...sources, composioSource];
    const composioClaimId = `c${claims.length + 1}`;
    claims = [
      ...claims,
      {
        id: composioClaimId,
        text: COMPOSIO_CLAIM_TEXT,
        status: "uncertain",
        sourceIds: [composioSource.id],
        note: "From Composio docs read on 2026-10-30; the source is the directory page, not the exact page for each step.",
      },
    ];
    const counts = claims.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {});
    stage("claim", "done", `${claims.length} claim(s): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);

    // 6 Assemble (model), 7 Validate (code), 8 Repair (model, within the budget)
    stage("assemble", "start");
    const tested: Guide["tested"] = [
      {
        what: "Fetch and read the cited pages",
        result: pages.length > 0 ? "passed" : "failed",
        note: `${pages.length} page(s) fetched with Anthropic's web_fetch tool at a ${budget.maxContentTokens.toLocaleString("en-US")}-token limit; ${pages.filter((p) => p.truncated).length} may be truncated. Every quote was matched against the raw page text.`,
      },
      { what: "Create the OAuth app in the provider's console", result: "not_tested", note: "Needs a logged-in provider account; the pipeline cannot do this." },
      { what: "Submit the app for review or verification", result: "not_tested", note: "Not attempted. No review outcome or real timing was observed." },
      managed.test,
    ];
    const ctxBase = { provider, claims, sources, tested, today, composio: { managedAuth: managed.managedAuth, note: managed.note } };
    const claimsForPrompt = claims.map((c) => ({ ...c, field: fieldOf.get(c.id) }));
    const first = await assemble({ client, tracker, model, budget, provider, claims: claimsForPrompt, sources, composioClaimId, notes: found.notes });
    stage("assemble", "done");

    stage("validate", "start");
    let assembled: Assembled | undefined = first.ok ? first.value : undefined;
    let errors: string[] = first.ok ? [] : first.errors;
    // When a reply cannot be parsed, keep its text so repair can fix the model's own output and the failure is diagnosable.
    let rawReply: string | undefined = first.ok ? undefined : first.rawText;
    const excerpt = (t: string) => `Reply began: ${JSON.stringify(t.slice(0, 240))}`;
    if (!first.ok) errors = [...errors, excerpt(first.rawText)];
    let guide: Guide | undefined;
    if (assembled) {
      const v = validateGuide(mergeGuide(assembled, { ...ctxBase, run: toRun(tracker, model) }));
      guide = v.guide;
      errors = v.errors;
    }
    stage("validate", "done", errors.length === 0 ? "Valid" : `${errors.length} problem(s)`);

    let tries = 0;
    while (!guide && tracker.mayRepair(tries)) {
      stage("repair", "start", errors.slice(0, 3).join("; "));
      const fixed = await repair({ client, tracker, model, budget, previous: assembled ?? rawReply ?? {}, errors, claimIds: claims.map((c) => c.id), composioClaimId });
      tries++;
      if (fixed.ok) {
        assembled = fixed.value;
        const v = validateGuide(mergeGuide(assembled, { ...ctxBase, run: toRun(tracker, model) }));
        guide = v.guide;
        errors = v.errors;
      } else {
        rawReply = fixed.rawText;
        errors = [...fixed.errors, excerpt(fixed.rawText)];
      }
      stage("repair", "done", errors.length === 0 ? "Valid" : `${errors.length} problem(s) remain`);
    }
    if (!guide) return incomplete("The guide did not pass validation", errors, assembled);
    // Re-stamp the run with the final totals (the repair loop may have added usage after the first merge).
    guide = { ...guide, run: toRun(tracker, model) };
    return finish({ status: "complete", guide, usage: snapshot(tracker), warnings });
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      return incomplete(`Stopped at the ${e.limit} limit`, [e.message]);
    }
    return incomplete("The run failed", [e instanceof Error ? e.message : String(e)]);
  }
}
