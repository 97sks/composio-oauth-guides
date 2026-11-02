import { z } from "zod";

/**
 * Output schema for an OAuth-app setup guide.
 * One schema serves hand-researched library guides and live-generated ones.
 *
 * Evidence model: prose fields (steps, requirements, blockers, verdict) point at
 * `claims` by id. Each claim has a status and sources, so the UI can show what
 * is backed by what and the generator cannot state a fact without a source.
 */

// ---------- Evidence ----------

// Every piece of guidance must cite at least one claim, and every claim at least
// one source link. Empty arrays are rejected, so nothing can go uncited.
const ClaimIds = z.array(z.string()).min(1);

export const SourceSchema = z.object({
  id: z.string(), // "s1", referenced by claims
  title: z.string(),
  url: z.url({ protocol: /^https$/ }), // the citation link; must be a real https page
  kind: z.enum([
    "official", // provider's own docs or console
    "vendor", // third-party integration vendor docs (Nango, Nylas, ...)
    "community", // forum, Stack Overflow, blog
  ]),
  retrieved: z.iso.date(), // when we read it
});

export const ClaimSchema = z.object({
  id: z.string(), // "c1"
  text: z.string(), // one checkable statement
  status: z.enum([
    "verified", // we tried it ourselves (see `tested`)
    "sourced", // an official source states it
    "anecdotal", // only community or vendor reports; not official
    "uncertain", // sources conflict or none found; shown as a warning
  ]),
  // At least one source, whatever the status. For "uncertain", cite the page
  // that was checked and did not settle the question.
  sourceIds: z.array(z.string()).min(1),
  note: z.string().optional(), // e.g. how sources disagree
});

export const TestedSchema = z.object({
  what: z.string(), // "GET /toolkits/gmail", "Create OAuth client in console"
  result: z.enum(["passed", "failed", "not_tested"]),
  note: z.string(), // what happened, or why it was not tested
});

// ---------- Verdict ----------

export const DifficultySchema = z.enum([
  "easy", // self-serve, no review
  "moderate", // self-serve but needs real prep (legal pages, domain)
  "hard", // review or verification required before real users
  "gated", // approval not guaranteed; provider decides if you get access
]);

export const VerdictSchema = z.object({
  difficulty: DifficultySchema,
  summary: z.string(), // 2-3 sentences, plain language
  // Hands-on work by the developer, excluding waiting. Always a range. It is an
  // estimate built from the cited steps, so it cites the claims it rests on.
  effort: z.object({
    label: z.string(), // "2-4 hours of your time"
    minHours: z.number().nonnegative(),
    maxHours: z.number().nonnegative(),
    claimIds: ClaimIds,
  }),
  // Elapsed calendar time from start to a working production connection:
  // effort plus waits. `maxDays` is omitted when any required wait is unpublished
  // (open-ended), and then `label` must say so.
  totalTime: z.object({
    label: z.string(), // "About 1 day to 3 weeks", or "At least 2 days; no upper bound published"
    minDays: z.number().nonnegative(),
    maxDays: z.number().nonnegative().optional(),
    openEnded: z.boolean(),
    claimIds: ClaimIds,
  }),
  // Overall wait: the path a typical developer takes, or the worst case if the
  // guide's scopes span several approval paths (see `approval`).
  wait: z.object({
    kind: z.enum(["none", "review", "assessment", "unknown"]),
    label: z.string(), // "3-5 business days", or "Not published"
    // How the wait figure is backed. "unpublished" means the provider gives no
    // figure and `label` must not contain a number.
    basis: z.enum(["official", "anecdotal", "unpublished"]),
  }),
  needsProviderApproval: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  confidenceNote: z.string(), // why, in one line
  claimIds: ClaimIds,
});

// ---------- Body ----------

export const RequirementSchema = z.object({
  label: z.string(), // "Public privacy policy URL"
  detail: z.string(),
  claimIds: ClaimIds,
});

export const ScopeSchema = z.object({
  name: z.string(),
  sensitivity: z.enum(["standard", "sensitive", "restricted", "not_applicable"]),
  needsReview: z.boolean(),
  note: z.string().optional(),
  claimIds: ClaimIds,
});

// The four stages every provider setup falls into. Steps are tagged with one so
// guides line up across providers.
export const StageSchema = z.enum([
  "registration", // create the OAuth app: name, URLs, redirect URI -> client credentials
  "scoping", // choose and, where needed, declare scopes
  "approval", // provider review, verification, publishing; absent for easy providers
  "execution", // authorize URL, token exchange, refresh, storage (Composio handles this)
]);

export const StepSchema = z.object({
  id: z.string(),
  stage: StageSchema,
  who: z.enum([
    "agent", // an agent can do or draft this
    "you", // developer must: logins, identity checks, legal terms, submitting
    "wait", // elapsed time, no action
  ]),
  title: z.string(),
  detail: z.string(),
  url: z.url().optional(), // deep link to the console page
  // For `agent` steps: what the agent produces. For `you` steps: why it can't.
  agentNote: z.string().optional(),
  claimIds: ClaimIds,
});

export const BlockerSchema = z.object({
  title: z.string(), // "Refresh tokens expire after 7 days in Testing"
  detail: z.string(),
  fix: z.string(), // what to do when this happens
  claimIds: ClaimIds,
});

// ---------- Stage detail ----------

// Stage 1 outputs and constraints.
export const RegistrationSchema = z.object({
  outputs: z.array(z.string()), // ["client_id", "client_secret"]
  redirectRules: z.array(z.string()), // "Exact match", "HTTPS required", "localhost allowed"
  environmentLimits: z.array(z.string()), // "100 test users", "one install per workspace"
  claimIds: ClaimIds,
});

// Stage 2: where scopes are declared. Many providers need both.
export const ScopingSchema = z.object({
  declaredWhere: z.enum([
    "console", // fixed in the developer console; authorize URL must match
    "runtime", // sent only in the authorize request
    "both",
    "none", // provider has no scope concept
    "unknown",
  ]),
  catalogUrl: z.url().optional(),
  claimIds: ClaimIds,
});

// One approval path. A provider can have several (Google: brand, sensitive,
// restricted), each with its own trigger and wait.
export const ApprovalPathSchema = z.object({
  name: z.string(), // "Sensitive scope verification"
  appliesWhen: z.string(), // "App requests any sensitive scope and has >100 users"
  required: z.boolean(),
  wait: z.object({
    label: z.string(),
    minDays: z.number().nonnegative().optional(),
    maxDays: z.number().nonnegative().optional(),
    basis: z.enum(["official", "anecdotal", "unpublished"]),
  }),
  recurring: z.string().optional(), // "Annual re-verification"
  // What is allowed while waiting or if never approved.
  interimLimits: z.array(z.string()), // "100-user cap", "Unverified-app warning"
  claimIds: ClaimIds,
});

// Stage 3 as data. Composio runs this; recorded so live guides for unfamiliar
// providers stay checkable and the custom-app config can be filled in.
export const ExecutionSchema = z.object({
  authorizeUrl: z.url().optional(),
  tokenUrl: z.url().optional(),
  pkce: z.enum(["required", "supported", "unsupported", "unknown"]),
  clientAuth: z.enum(["body", "basic", "either", "unknown"]),
  refresh: z.object({
    issued: z.enum(["yes", "no", "conditional", "unknown"]),
    note: z.string().optional(), // "Needs access_type=offline", "Rotates on use"
  }),
  accessTokenTtl: z.string().optional(),
  extraAuthorizeParams: z.array(z.object({ name: z.string(), value: z.string(), why: z.string() })),
  claimIds: ClaimIds,
});

// ---------- Composio tail ----------

export const ComposioSchema = z.object({
  toolkitSlug: z.string().optional(),
  managedAuth: z.enum(["available", "not_available", "unknown"]),
  managedAuthNote: z.string().optional(), // what a custom app buys you here
  redirectUri: z.literal("https://backend.composio.dev/api/v3/toolkits/auth/callback"),
  // Comma-separated scopes for the auth config snippet.
  authConfigScopes: z.string(),
});

// ---------- Run (what producing the guide cost) ----------

export const RunSchema = z.object({
  source: z.enum([
    "pipeline", // produced by the automated pipeline, usage metered per stage
    "manual_research", // pages fetched by script, assembly done by hand; only fetch calls are metered
  ]),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(), // priced from published rates, not read from billing
  stages: z.array(
    z.object({
      stage: z.string(),
      calls: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
    }),
  ),
  note: z.string(), // what is and is not included in the numbers
});

// ---------- Guide ----------

export const GuideSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    website: z.url(),
    developerPortalUrl: z.url().optional(),
    origin: z.enum(["library", "live"]),
    lastChecked: z.iso.date(),

    verdict: VerdictSchema,
    requirements: z.array(RequirementSchema),
    registration: RegistrationSchema,
    scoping: ScopingSchema,
    scopes: z.array(ScopeSchema),
    approval: z.array(ApprovalPathSchema), // empty when nobody reviews you
    execution: ExecutionSchema,
    steps: z.array(StepSchema).min(1),
    blockers: z.array(BlockerSchema),
    composio: ComposioSchema,

    claims: z.array(ClaimSchema),
    sources: z.array(SourceSchema),
    tested: z.array(TestedSchema),
    openQuestions: z.array(z.string()), // things we could not determine
    run: RunSchema.optional(), // cost and token usage of producing this guide, when recorded
  })
  .superRefine((g, ctx) => {
    const claimIds = new Set(g.claims.map((c) => c.id));
    const sourceIds = new Set(g.sources.map((s) => s.id));
    const claimById = new Map(g.claims.map((c) => [c.id, c]));
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });

    // Every claim reference must resolve.
    const refs: [string, string[]][] = [
      ["verdict", g.verdict.claimIds],
      ...g.requirements.map((r, i): [string, string[]] => [`requirements[${i}]`, r.claimIds]),
      ...g.scopes.map((s, i): [string, string[]] => [`scopes[${i}]`, s.claimIds]),
      ["registration", g.registration.claimIds],
      ["scoping", g.scoping.claimIds],
      ["execution", g.execution.claimIds],
      ...g.approval.map((a, i): [string, string[]] => [`approval[${i}]`, a.claimIds]),
      ...g.steps.map((s, i): [string, string[]] => [`steps[${i}]`, s.claimIds]),
      ...g.blockers.map((b, i): [string, string[]] => [`blockers[${i}]`, b.claimIds]),
    ];
    for (const [where, ids] of refs) {
      for (const id of ids) if (!claimIds.has(id)) fail(`${where} cites unknown claim ${id}`);
    }

    // Claims must be backed by what their status says.
    for (const c of g.claims) {
      for (const id of c.sourceIds) if (!sourceIds.has(id)) fail(`claim ${c.id} cites unknown source ${id}`);
      if (c.status === "sourced") {
        const official = c.sourceIds.some((id) => g.sources.find((s) => s.id === id)?.kind === "official");
        if (!official) fail(`claim ${c.id} is "sourced" but has no official source`);
      }
      if (c.status === "anecdotal" && c.sourceIds.length === 0) fail(`claim ${c.id} is "anecdotal" but has no source`);
      if (c.status === "verified" && !g.tested.some((t) => t.result === "passed"))
        fail(`claim ${c.id} is "verified" but no test passed`);
    }

    // A wait figure must be backed. Unpublished means no number in the label.
    if (g.verdict.wait.basis === "unpublished" && /\d/.test(g.verdict.wait.label))
      fail("wait.basis is unpublished but wait.label contains a number");
    if (g.verdict.wait.basis === "official") {
      const backed = g.verdict.claimIds.some((id) => claimById.get(id)?.status === "sourced");
      if (!backed) fail('wait.basis is "official" but the verdict cites no sourced claim');
    }

    // Every source must be cited by a claim, so the source list has no orphans.
    const cited = new Set(g.claims.flatMap((c) => c.sourceIds));
    for (const s of g.sources) if (!cited.has(s.id)) fail(`source ${s.id} is not cited by any claim`);

    // Effort and total time are ranges that must hang together.
    const { effort, totalTime } = g.verdict;
    if (effort.minHours > effort.maxHours) fail("effort.minHours exceeds maxHours");
    if (totalTime.maxDays != null && totalTime.minDays > totalTime.maxDays) fail("totalTime.minDays exceeds maxDays");
    // Same-day totals are fine (minDays 0); only multi-day effort must show up in the total.
    if (totalTime.minDays < Math.floor(effort.minHours / 24)) fail("totalTime.minDays is shorter than the minimum effort");
    const requiredPaths = g.approval.filter((a) => a.required);
    const unboundedWait =
      g.verdict.wait.basis === "unpublished" && g.verdict.wait.kind !== "none"
        ? true
        : requiredPaths.some((a) => a.wait.basis === "unpublished" || a.wait.maxDays == null);
    if (totalTime.openEnded !== unboundedWait)
      fail(`totalTime.openEnded is ${totalTime.openEnded} but required waits ${unboundedWait ? "have" : "have no"} unpublished bounds`);
    if (totalTime.openEnded && totalTime.maxDays != null) fail("totalTime is openEnded but gives maxDays");
    if (!totalTime.openEnded && totalTime.maxDays == null) fail("totalTime is bounded but has no maxDays");
    if (!totalTime.openEnded && totalTime.maxDays != null) {
      const longestWait = Math.max(0, ...requiredPaths.map((a) => a.wait.maxDays ?? 0));
      if (totalTime.maxDays < longestWait) fail("totalTime.maxDays is shorter than the longest required approval wait");
    }

    // Per-path wait figures follow the same rules as the overall wait.
    g.approval.forEach((a, i) => {
      if (a.wait.basis === "unpublished" && (/\d/.test(a.wait.label) || a.wait.minDays != null || a.wait.maxDays != null))
        fail(`approval[${i}] wait.basis is unpublished but gives a figure`);
      if (a.wait.basis === "official" && !a.claimIds.some((id) => claimById.get(id)?.status === "sourced"))
        fail(`approval[${i}] wait.basis is "official" but cites no sourced claim`);
      if (a.wait.minDays != null && a.wait.maxDays != null && a.wait.minDays > a.wait.maxDays)
        fail(`approval[${i}] wait.minDays exceeds maxDays`);
    });

    // Approval paths and the verdict must agree.
    if (g.approval.some((a) => a.required) && !g.verdict.needsProviderApproval)
      fail("an approval path is required but needsProviderApproval is false");
    if (g.verdict.needsProviderApproval && !g.approval.some((a) => a.required))
      fail("needsProviderApproval is true but no approval path is required");
    if (g.approval.length > 0 && !g.steps.some((s) => s.stage === "approval"))
      fail("approval paths exist but no step has stage approval");

    // Verdict consistency.
    if (g.verdict.needsProviderApproval && g.verdict.wait.kind === "none")
      fail("needsProviderApproval is true but wait.kind is none");
    if (g.verdict.difficulty === "easy" && g.verdict.needsProviderApproval)
      fail("difficulty easy conflicts with needsProviderApproval");
  });

export type Source = z.infer<typeof SourceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Tested = z.infer<typeof TestedSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type ApprovalPath = z.infer<typeof ApprovalPathSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Guide = z.infer<typeof GuideSchema>;
