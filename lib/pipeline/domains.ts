import type { ProviderDomains } from "./claim";

/**
 * Which hosts count as the provider's own ("official") is decided here, in code, never by
 * the model alone. The user-supplied URL is trusted; model-proposed domains are accepted only
 * if their name starts with the provider's name. This is a heuristic: a lookalike such as
 * "slackattack.com" would pass it, so a "sourced" claim is only as good as this check.
 */

const TWO_PART_SUFFIXES = new Set(["co.uk", "org.uk", "com.au", "co.in", "co.jp", "com.br", "co.nz", "com.sg"]);

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/** "Linear" -> "linear"; "Google Calendar" -> "google". */
export function nameToken(name: string): string {
  return (name.toLowerCase().match(/[a-z0-9]+/g) ?? [""])[0];
}

const hostOf = (url: string): string | null => {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
};

const labelOf = (domain: string) => domain.split(".")[0];

/** Integration vendors accepted as secondary ("vendor") sources. */
export const VENDOR_DOMAINS = ["composio.dev", "nango.dev", "nylas.com", "merge.dev", "unified.to"];

export function buildProviderDomains(input: {
  name: string;
  userUrl?: string;
  website?: string;
  proposed?: string[];
}): ProviderDomains {
  const token = nameToken(input.name);
  const official = new Set<string>();
  const add = (candidate: string | undefined, requireName: boolean) => {
    if (!candidate) return;
    const host = hostOf(candidate);
    if (!host) return;
    const domain = registrableDomain(host);
    if (requireName && !(token && labelOf(domain).startsWith(token))) return;
    official.add(domain);
  };
  add(input.userUrl, false); // the user told us where the provider lives
  add(input.website, true);
  for (const p of input.proposed ?? []) add(p, true);
  return { official: [...official], vendor: VENDOR_DOMAINS };
}
