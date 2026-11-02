import type { Resolved } from "../resolve";

export const DISCOVER_SYSTEM =
  "You locate the official developer documentation an engineer needs to register an OAuth app with a provider and get it approved. " +
  "Use the web_search tool. Reply with one JSON object and nothing else.";

export function discoverUser(r: Resolved, maxPages: number): string {
  return `App: ${r.name}${r.userUrl ? `\nWebsite: ${r.userUrl}` : ""}

Find pages on the provider's OWN domains (developer docs or help centre), at most 2 per topic and ${maxPages} in total:
- registration: how to create or register an OAuth app in the developer console
- flow: the OAuth authorization flow (authorize URL, token endpoint, PKCE, token expiry and refresh)
- scopes: the list of scopes or permissions
- review: any app review, verification, publishing, marketplace listing or admin-approval requirement, including how long it takes. If the provider has no review, still return the page that explains how an app goes live.
- limits: rate limits or app limits that apply to OAuth apps (only if an obvious page exists)

Only use URLs that appeared in your search results. Never invent a URL.

Reply with JSON:
{"provider":{"name":"<canonical product name>","website":"https://...","developerPortalUrl":"https://... (omit if unknown)","officialDomains":["registrable domains the provider owns, e.g. example.com"]},
 "pages":[{"topic":"registration|flow|scopes|review|limits","url":"https://...","title":"..."}],
 "notes":"<anything you could not find>"}`;
}
