import { z } from "zod";
import {
  ApprovalPathSchema,
  BlockerSchema,
  DifficultySchema,
  ExecutionSchema,
  GuideSchema,
  RegistrationSchema,
  RequirementSchema,
  ScopeSchema,
  ScopingSchema,
  StepSchema,
  type Claim,
  type Guide,
  type Source,
} from "../guide-schema";
import { callModel, type ModelClient } from "./anthropic";
import type { Budget } from "./config";
import type { UsageTracker } from "./budget";
import { deriveNeedsProviderApproval, deriveTotalTime, formatDays } from "./derive";
import { parseWith } from "./json";
import { ASSEMBLE_SYSTEM, assembleUser, repairUser } from "./prompts/assemble";
import { slugify } from "./resolve";

/** What the model writes. Everything evidence-related and every derived number is added by code. */
export const AssembledSchema = z.object({
  verdict: z.object({
    difficulty: DifficultySchema,
    summary: z.string(),
    effort: z.object({ label: z.string(), minHours: z.number().nonnegative(), maxHours: z.number().nonnegative(), rationale: z.string() }),
    wait: z.object({
      kind: z.enum(["none", "review", "assessment", "unknown"]),
      label: z.string(),
      basis: z.enum(["official", "anecdotal", "unpublished"]),
    }),
    confidence: z.enum(["high", "medium", "low"]),
    confidenceNote: z.string(),
    claimIds: z.array(z.string()).min(1),
  }),
  requirements: z.array(RequirementSchema),
  registration: RegistrationSchema,
  scoping: ScopingSchema,
  scopes: z.array(ScopeSchema),
  approval: z.array(ApprovalPathSchema),
  execution: ExecutionSchema,
  steps: z.array(StepSchema).min(1),
  blockers: z.array(BlockerSchema),
  composio: z.object({ managedAuthNote: z.string().optional(), authConfigScopes: z.string() }),
  openQuestions: z.array(z.string()),
});
export type Assembled = z.infer<typeof AssembledSchema>;

export type MergeContext = {
  provider: { name: string; website: string; developerPortalUrl?: string };
  claims: Claim[];
  sources: Source[];
  tested: Guide["tested"];
  run: Guide["run"];
  today: string;
  /** From the Composio lookup, when one ran. */
  composio?: { managedAuth: "available" | "not_available" | "unknown"; note: string };
};

/** Combine the model's prose with code-owned parts (evidence, derived values, constants). */
export function mergeGuide(a: Assembled, ctx: MergeContext): unknown {
  const estimateId = `c${ctx.claims.length + 1}`;
  const estimate: Claim = {
    id: estimateId,
    text: `Estimate: ${a.verdict.effort.rationale}`,
    status: "uncertain",
    sourceIds: ctx.sources.slice(0, 2).map((s) => s.id),
    note: "Agent estimate, not a measured time.",
  };
  const effort = { label: a.verdict.effort.label, minHours: a.verdict.effort.minHours, maxHours: a.verdict.effort.maxHours, claimIds: [estimateId] };
  const derived = deriveTotalTime(effort, a.approval);
  const required = a.approval.filter((p) => p.required);

  // Keep the wait honest: no figure without a source basis.
  let wait = a.verdict.wait;
  if (wait.basis === "unpublished" && /\d/.test(wait.label)) wait = { ...wait, label: "Not published" };

  return {
    slug: slugify(ctx.provider.name),
    name: ctx.provider.name,
    website: ctx.provider.website,
    developerPortalUrl: ctx.provider.developerPortalUrl,
    origin: "live",
    lastChecked: ctx.today,
    verdict: {
      difficulty: a.verdict.difficulty,
      summary: a.verdict.summary,
      effort,
      totalTime: {
        label: derived.openEnded
          ? derived.minDays > 0
            ? formatDays(derived.minDays)
            : "No upper bound: the provider publishes no review time"
          : formatDays(derived.minDays, derived.maxDays),
        minDays: derived.minDays,
        maxDays: derived.maxDays,
        openEnded: derived.openEnded,
        claimIds: [estimateId, ...(required[0]?.claimIds.slice(0, 1) ?? a.verdict.claimIds.slice(0, 1))],
      },
      wait,
      needsProviderApproval: deriveNeedsProviderApproval(a.approval),
      confidence: a.verdict.confidence,
      confidenceNote: a.verdict.confidenceNote,
      claimIds: a.verdict.claimIds,
    },
    requirements: a.requirements,
    registration: a.registration,
    scoping: a.scoping,
    scopes: a.scopes,
    approval: a.approval,
    execution: a.execution,
    steps: a.steps,
    blockers: a.blockers,
    composio: {
      toolkitSlug: slugify(ctx.provider.name),
      managedAuth: ctx.composio?.managedAuth ?? "unknown",
      managedAuthNote: [ctx.composio?.note, a.composio.managedAuthNote].filter(Boolean).join(" ") || undefined,
      redirectUri: "https://backend.composio.dev/api/v3/toolkits/auth/callback",
      authConfigScopes: a.composio.authConfigScopes,
    },
    claims: [...ctx.claims, estimate],
    sources: ctx.sources,
    tested: ctx.tested,
    openQuestions: a.openQuestions,
    run: ctx.run,
  };
}

/** Schema errors for a merged guide, as readable lines. Empty means valid. */
export function validateGuide(candidate: unknown): { guide?: Guide; errors: string[] } {
  const result = GuideSchema.safeParse(candidate);
  if (result.success) return { guide: result.data, errors: [] };
  return { errors: result.error.issues.map((i) => `${i.path.join(".") || "(guide)"}: ${i.message}`) };
}

type CommonOpts = { client: ModelClient; tracker: UsageTracker; model: string; budget: Budget };

export async function assemble(
  opts: CommonOpts & {
    provider: MergeContext["provider"];
    claims: Array<Claim & { field?: string }>;
    sources: Source[];
    composioClaimId: string;
    notes?: string;
  },
): Promise<{ ok: true; value: Assembled; raw: unknown } | { ok: false; errors: string[]; raw?: unknown }> {
  const call = await callModel({
    client: opts.client,
    tracker: opts.tracker,
    stage: "assemble",
    params: {
      model: opts.model,
      max_tokens: opts.budget.maxOutputTokensPerCall,
      system: ASSEMBLE_SYSTEM,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: assembleUser(opts) }],
    },
  });
  const parsed = parseWith(AssembledSchema, call.text);
  return parsed.ok ? { ok: true, value: parsed.value, raw: parsed.value } : { ok: false, errors: parsed.errors };
}

export async function repair(
  opts: CommonOpts & { previous: unknown; errors: string[]; claimIds: string[]; composioClaimId: string },
): Promise<{ ok: true; value: Assembled } | { ok: false; errors: string[] }> {
  const call = await callModel({
    client: opts.client,
    tracker: opts.tracker,
    stage: "repair",
    params: {
      model: opts.model,
      max_tokens: opts.budget.maxOutputTokensPerCall,
      system: ASSEMBLE_SYSTEM,
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: repairUser(opts) }],
    },
  });
  const parsed = parseWith(AssembledSchema, call.text);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, errors: parsed.errors };
}
