import type { Claim, Source } from "../../guide-schema";

export const ASSEMBLE_SYSTEM =
  "You write the body of a developer setup guide for registering an OAuth app with a provider and getting it approved. " +
  "You are given numbered claims, each already checked against a source page. Write only from those claims. Reply with one JSON object and nothing else.";

const SHAPE = `{
 "verdict": {
  "difficulty": "easy|moderate|hard|gated",   // easy = self-serve, no review; moderate = self-serve but real prep; hard = review or verification before real users; gated = provider may refuse
  "summary": "2-3 plain sentences",
  "effort": {"label": "e.g. About 1-3 hours of your time", "minHours": 1, "maxHours": 3, "rationale": "why, from the steps"},   // the developer's hands-on time, excluding waiting
  "wait": {"kind": "none|review|assessment|unknown", "label": "...", "basis": "official|anecdotal|unpublished"},   // the provider's wait; basis unpublished means the label has no digits
  "confidence": "high|medium|low", "confidenceNote": "one line",
  "claimIds": ["c1"]
 },
 "requirements": [{"label": "", "detail": "", "claimIds": []}],
 "registration": {"outputs": ["Client ID"], "redirectRules": [], "environmentLimits": [], "claimIds": []},
 "scoping": {"declaredWhere": "console|runtime|both|none|unknown", "catalogUrl": "https://... (optional)", "claimIds": []},
 "scopes": [{"name": "", "sensitivity": "standard|sensitive|restricted|not_applicable", "needsReview": false, "note": "(optional)", "claimIds": []}],
 "approval": [{"name": "", "appliesWhen": "", "required": false, "wait": {"label": "", "minDays": 0, "maxDays": 0, "basis": "official|anecdotal|unpublished"}, "recurring": "(optional)", "interimLimits": [], "claimIds": []}],
 "execution": {"authorizeUrl": "(optional)", "tokenUrl": "(optional)", "pkce": "required|supported|unsupported|unknown", "clientAuth": "body|basic|either|unknown", "refresh": {"issued": "yes|no|conditional|unknown", "note": "(optional)"}, "accessTokenTtl": "(optional)", "extraAuthorizeParams": [{"name": "", "value": "", "why": ""}], "claimIds": []},
 "steps": [{"id": "st1", "stage": "registration|scoping|approval|execution", "who": "agent|you|wait", "title": "", "detail": "", "url": "https://... (optional)", "agentNote": "(optional)", "claimIds": []}],
 "blockers": [{"title": "", "detail": "", "fix": "", "claimIds": []}],
 "composio": {"managedAuthNote": "(optional)", "authConfigScopes": "comma-separated scope names for the auth config"},
 "openQuestions": ["things the claims do not answer"]
}`;

export function rules(composioClaimId: string): string {
  return `Rules:
1. Use ONLY facts in the claims. Every object that has "claimIds" must cite at least one claim id, copied exactly from the list. Never invent an id.
2. If the claims do not answer something, use "unknown" or omit the optional field, and add the gap to "openQuestions". Never guess a number, duration or URL.
3. Durations come only from claims. If no claim gives a figure for a wait, set basis "unpublished" and label "Not published" (no digits). minDays/maxDays are calendar days (weeks x 7); if the source says business days, say so in the label. Omit maxDays when the source gives no upper bound.
4. An approval path is "required": true ONLY if a claim says the app cannot be used by real users without it. A listing, marketplace review or certification that the claims describe as optional, or whose necessity the claims do not state, must have "required": false, and the question goes in "openQuestions". Never mark a path required out of caution. Difficulty "hard" or "gated" needs a required path; otherwise use "moderate" and explain in the summary what the optional review gets the developer. If the provider has no review, "approval" may be [] or contain only optional paths. If "approval" is not empty, include at least one step with stage "approval".
5. Steps (5 to 12), in order: registration, scoping, approval (if any), execution. "agent" = an agent can do or draft it (draft listing text, compute scopes, create the Composio auth config through the API, run a Connect Link test). "you" = needs the developer's login, identity, legal terms, hosting, recording or submitting. "wait" = elapsed time with no action.
6. The registration step where the callback URL is entered must say to use https://backend.composio.dev/api/v3/toolkits/auth/callback. Steps about the Composio auth config, session and Connect Link test cite claim ${composioClaimId}.
7. "easy" difficulty is only for a provider with no review at all and little prep. Use "hard" or "gated" only when a required approval path exists.
8. Effort is your estimate from the steps; give the reasoning in "rationale". Plain language, short sentences, no marketing.
9. Mention in "confidenceNote" if important claims are marked uncertain or anecdotal.`;
}

export function assembleUser(input: {
  provider: { name: string; website: string; developerPortalUrl?: string };
  claims: Array<Claim & { field?: string }>;
  sources: Source[];
  composioClaimId: string;
  notes?: string;
}): string {
  const claimLines = input.claims
    .map((c) => `${c.id} [${c.status}]${c.field ? ` (${c.field})` : ""} ${c.text}${c.note ? ` — note: ${c.note}` : ""} — sources: ${c.sourceIds.join(", ")}`)
    .join("\n");
  const sourceLines = input.sources.map((s) => `${s.id} (${s.kind}) ${s.title} ${s.url}`).join("\n");
  return `Provider: ${input.provider.name} (${input.provider.website})${input.provider.developerPortalUrl ? `\nDeveloper portal: ${input.provider.developerPortalUrl}` : ""}${input.notes ? `\nDiscovery notes: ${input.notes}` : ""}

CLAIMS (status in brackets):
${claimLines}

SOURCES:
${sourceLines}

${rules(input.composioClaimId)}

Output JSON shape:
${SHAPE}`;
}

export function repairUser(input: { previous: unknown; errors: string[]; claimIds: string[]; composioClaimId: string }): string {
  return `Your previous JSON failed validation. Fix ONLY the problems listed and return the complete corrected JSON object (same shape, nothing else).

Problems:
${input.errors.map((e) => `- ${e}`).join("\n")}

Valid claim ids: ${input.claimIds.join(", ")}
${rules(input.composioClaimId)}

Previous JSON:
${JSON.stringify(input.previous)}`;
}
