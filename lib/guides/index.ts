import type { Guide } from "../guide-schema";
import { githubGuide } from "./github";
import { googleGuide } from "./google";
import { slackGuide } from "./slack";

/** The hand-researched library. Anything not here is generated live. */
export const libraryGuides: Guide[] = [githubGuide, googleGuide, slackGuide];

/** Words people type that mean a library guide's slug. */
const ALIASES: Record<string, string> = { google: "gmail", googlemail: "gmail" };

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
}

export function findLibraryGuide(query: string): Guide | undefined {
  const q = normalizeQuery(query);
  if (!q) return undefined;
  const words = q.split(/[^a-z0-9]+/).filter(Boolean);
  return libraryGuides.find(
    (g) =>
      q === g.name.toLowerCase() ||
      words.includes(g.slug) ||
      words.some((w) => ALIASES[w] === g.slug),
  );
}
