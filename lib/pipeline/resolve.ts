import { normalizeQuery } from "../guides";

export type Resolved = {
  query: string;
  /** Best-effort display name until discovery returns the canonical one. */
  name: string;
  /** Set when the user typed a URL or domain; trusted as the provider's own site. */
  userUrl?: string;
};

const looksLikeDomain = (q: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(q);

export function resolveQuery(query: string): Resolved {
  const q = normalizeQuery(query);
  if (looksLikeDomain(q)) {
    const host = q.split("/")[0];
    const label = host.split(".").slice(-2, -1)[0] ?? host;
    return { query, name: label.charAt(0).toUpperCase() + label.slice(1), userUrl: `https://${host}` };
  }
  const name = q
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { query, name };
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}
