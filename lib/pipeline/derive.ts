import type { Guide } from "../guide-schema";

/**
 * Values computed from the structured data, never written by the model.
 * Assumption to revisit: required approval paths are treated as happening one
 * after another, so their waits add up. Paths that overlap would need a flag in
 * the schema.
 */

type Approval = Guide["approval"];

export function deriveNeedsProviderApproval(approval: Approval): boolean {
  return approval.some((a) => a.required);
}

export function deriveOpenEnded(approval: Approval): boolean {
  return approval.some((a) => a.required && (a.wait.basis === "unpublished" || a.wait.maxDays == null));
}

export function deriveTotalTime(
  effort: { minHours: number; maxHours: number },
  approval: Approval,
): { minDays: number; maxDays?: number; openEnded: boolean } {
  const required = approval.filter((a) => a.required);
  const openEnded = deriveOpenEnded(approval);
  const minDays = required.reduce((sum, a) => sum + (a.wait.minDays ?? 0), 0) + Math.floor(effort.minHours / 24);
  if (openEnded) return { minDays, openEnded };
  const maxDays = required.reduce((sum, a) => sum + (a.wait.maxDays ?? 0), 0) + Math.ceil(effort.maxHours / 8);
  return { minDays, maxDays, openEnded };
}

/** Numbers in a label come from the data, so a label cannot disagree with it. */
export function formatDays(minDays: number, maxDays?: number): string {
  if (maxDays == null) return `At least ${minDays} day${minDays === 1 ? "" : "s"}; no upper bound published`;
  if (maxDays <= 1 && minDays === 0) return "Under 1 day";
  return minDays === maxDays ? `${maxDays} days` : `${minDays}-${maxDays} days`;
}

export function statusTally(claims: Guide["claims"]): Record<Guide["claims"][number]["status"], number> {
  const t = { verified: 0, sourced: 0, anecdotal: 0, uncertain: 0 };
  for (const c of claims) t[c.status]++;
  return t;
}

export function orphanSourceIds(g: Pick<Guide, "claims" | "sources">): string[] {
  const cited = new Set(g.claims.flatMap((c) => c.sourceIds));
  return g.sources.filter((s) => !cited.has(s.id)).map((s) => s.id);
}

/** Unused claim ids, so assembly can drop or cite them. */
export function uncitedClaimIds(g: Guide): string[] {
  const used = new Set<string>([
    ...g.verdict.claimIds,
    ...g.verdict.effort.claimIds,
    ...g.verdict.totalTime.claimIds,
    ...g.requirements.flatMap((x) => x.claimIds),
    ...g.registration.claimIds,
    ...g.scoping.claimIds,
    ...g.scopes.flatMap((x) => x.claimIds),
    ...g.approval.flatMap((x) => x.claimIds),
    ...g.execution.claimIds,
    ...g.steps.flatMap((x) => x.claimIds),
    ...g.blockers.flatMap((x) => x.claimIds),
  ]);
  return g.claims.filter((c) => !used.has(c.id)).map((c) => c.id);
}
