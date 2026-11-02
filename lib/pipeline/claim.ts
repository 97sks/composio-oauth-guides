import type { Claim, Source } from "../guide-schema";
import { canonicalUrl, quoteInPage, type FetchedPage } from "./fetch";

/**
 * Claim stage: no model. Takes facts the extraction call proposed (each with a
 * verbatim quote and a URL) and decides source kind, status and numbering by rule,
 * so the model can never grant itself a stronger claim than the page supports.
 */

export type Fact = {
  field: string; // schema field it supports, e.g. "execution.pkce"
  text: string; // one checkable statement
  url: string; // page the quote came from
  quote: string; // verbatim excerpt
};

export type ProviderDomains = {
  official: string[]; // hostnames or registrable domains, e.g. ["github.com", "githubusercontent.com"]
  vendor: string[]; // third-party integration vendors we accept as secondary
};

export function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

const matches = (host: string, domain: string) => host === domain || host.endsWith("." + domain);

export function sourceKind(url: string, domains: ProviderDomains): Source["kind"] {
  const host = hostOf(url);
  if (domains.official.some((d) => matches(host, d))) return "official";
  if (domains.vendor.some((d) => matches(host, d))) return "vendor";
  return "community";
}

export type PageWithFlags = FetchedPage & { truncated: boolean; title: string | null };

export type ClaimStageResult = {
  claims: Claim[];
  sources: Source[];
  /** fact.field -> claim id, so assembly can reference claims by field */
  byField: Map<string, string[]>;
};

/** Status by rule. "verified" is reserved for hands-on tests and is never produced here. */
export function statusFor(kind: Source["kind"], quoteFound: boolean): { status: Claim["status"]; note?: string } {
  if (!quoteFound) return { status: "uncertain", note: "Quote was not found on the cited page." };
  if (kind === "official") return { status: "sourced" };
  return { status: "anecdotal", note: "Only a non-official source states this." };
}

export function buildClaims(
  facts: Fact[],
  pages: PageWithFlags[],
  domains: ProviderDomains,
  today: string,
): ClaimStageResult {
  const sources: Source[] = [];
  const sourceIdByUrl = new Map<string, string>();
  const claims: Claim[] = [];
  const byField = new Map<string, string[]>();
  const pageByUrl = new Map(pages.map((p) => [canonicalUrl(p.url), p]));

  for (const fact of facts) {
    const page = pageByUrl.get(canonicalUrl(fact.url));
    // A fact whose URL we never fetched cannot be sourced at all.
    const url = page?.url ?? fact.url;
    const kind = sourceKind(url, domains);
    let sid = sourceIdByUrl.get(canonicalUrl(url));
    if (!sid) {
      sid = `s${sources.length + 1}`;
      sourceIdByUrl.set(canonicalUrl(url), sid);
      sources.push({ id: sid, title: page?.title ?? url, url, kind, retrieved: today });
    }
    const found = page ? quoteInPage(page, fact.quote) : false;
    const { status, note } = statusFor(kind, found);
    const extra = !page ? "Page was not fetched in this run." : undefined;
    const id = `c${claims.length + 1}`;
    claims.push({ id, text: fact.text, status: page ? status : "uncertain", sourceIds: [sid], note: extra ?? note });
    byField.set(fact.field, [...(byField.get(fact.field) ?? []), id]);
  }
  return { claims, sources, byField };
}

/**
 * "No review exists" style claims. Absence is never better than `uncertain`, and the
 * note lists the pages checked and which of them may be cut short.
 */
export function negativeClaim(
  text: string,
  pagesChecked: PageWithFlags[],
  sourceIdFor: (url: string) => string,
  id: string,
): Claim {
  const list = pagesChecked.map((p) => `${hostOf(p.url)}${new URL(p.url).pathname}${p.truncated ? " (truncated)" : ""}`).join("; ");
  return {
    id,
    text,
    status: "uncertain",
    sourceIds: pagesChecked.map((p) => sourceIdFor(p.url)),
    note: `Absence from the pages checked, not a statement by the provider. Checked: ${list}.`,
  };
}

/** The agent's own estimates (effort, total time) are always uncertain and cite what they derive from. */
export function estimateClaim(text: string, basisSourceIds: string[], id: string): Claim {
  return { id, text, status: "uncertain", sourceIds: basisSourceIds, note: "Agent estimate, not a measured time." };
}

/** Register a fetched page as a source even if no fact cites it yet (used by negative claims). */
export function ensureSource(result: ClaimStageResult, page: PageWithFlags, domains: ProviderDomains, today: string): string {
  const key = canonicalUrl(page.url);
  const existing = result.sources.find((s) => canonicalUrl(s.url) === key);
  if (existing) return existing.id;
  const id = `s${result.sources.length + 1}`;
  result.sources.push({ id, title: page.title ?? page.url, url: page.url, kind: sourceKind(page.url, domains), retrieved: today });
  return id;
}
