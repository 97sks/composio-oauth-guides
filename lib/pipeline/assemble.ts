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
import { extractJson, type Parsed } from "./json";
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

const STAGE_WORDS: Array<[Assembled["steps"][number]["stage"], RegExp]> = [
  ["registration", /regist|setup|set up|creat|console|credential|app$/],
  ["scoping", /scope|permission|access/],
  ["approval", /review|listing|publish|certif|verif|submit|market|launch|approv|wait/],
  ["execution", /auth|token|test|integrat|composio|connect|session|oauth|flow|run/],
];
const WHO_WORDS: Array<["agent" | "you" | "wait", RegExp]> = [
  ["wait", /wait|elapsed|pending/],
  ["agent", /agent|ai|auto|assistant|bot|composio/],
  ["you", /you|developer|human|user|manual|owner|admin/],
];

/**
 * Models sometimes drift on enum words (a step stage of "listing", a "who" of "developer").
 * Fix the obvious cases in code rather than spend a repair call; anything unclear is left for validation.
 */
export function normalizeAssembled(raw: unknown): { value: unknown; notes: string[] } {
  const notes: string[] = [];
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { steps?: unknown }).steps)) return { value: raw, notes };
  const stages = new Set(["registration", "scoping", "approval", "execution"]);
  const whos = new Set(["agent", "you", "wait"]);
  const steps = (raw as { steps: Array<Record<string, unknown>> }).steps.map((s) => {
    if (!s || typeof s !== "object") return s;
    const out = { ...s };
    if (typeof out.stage === "string" && !stages.has(out.stage)) {
      const w = out.stage.toLowerCase();
      const hit = STAGE_WORDS.find(([, re]) => re.test(w));
      if (hit) {
        notes.push(`step stage "${out.stage}" -> ${hit[0]}`);
        out.stage = hit[0];
      }
    }
    if (typeof out.who === "string" && !whos.has(out.who)) {
      const w = out.who.toLowerCase();
      const hit = WHO_WORDS.find(([, re]) => re.test(w));
      if (hit) {
        notes.push(`step who "${out.who}" -> ${hit[0]}`);
        out.who = hit[0];
      }
    }
    return out;
  });
  return { value: { ...(raw as object), steps }, notes };
}

/** Parse the model's reply: extract JSON, fix enum drift, then validate the shape. */
export function parseAssembled(text: string): Parsed<Assembled> & { notes: string[] } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)], notes: [] };
  }
  const { value, notes } = normalizeAssembled(raw);
  const result = AssembledSchema.safeParse(value);
  if (result.success) return { ok: true, value: result.data, notes };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`), notes };
}

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
): Promise<{ ok: true; value: Assembled; raw: unknown } | { ok: false; errors: string[]; rawText: string }> {
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
  const parsed = parseAssembled(call.text);
  return parsed.ok ? { ok: true, value: parsed.value, raw: parsed.value } : { ok: false, errors: parsed.errors, rawText: call.text };
}

export async function repair(
  opts: CommonOpts & { previous: unknown; errors: string[]; claimIds: string[]; composioClaimId: string },
): Promise<{ ok: true; value: Assembled } | { ok: false; errors: string[]; rawText: string }> {
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
  const parsed = parseAssembled(call.text);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, errors: parsed.errors, rawText: call.text };
}
