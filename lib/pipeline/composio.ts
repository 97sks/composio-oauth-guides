/**
 * Composio toolkit lookup: does Composio already ship a managed OAuth app for this provider?
 * GET /api/v3.1/toolkits/{slug} and read `composio_managed_auth_schemes` (per Composio's docs; the
 * response shape has not been checked against a live call yet, so parsing is defensive).
 * The key is sent only to backend.composio.dev and never logged or returned.
 */
const BASE = "https://backend.composio.dev/api/v3.1";

export type ToolkitLookup =
  | { status: "found"; slug: string; managedSchemes: string[] }
  | { status: "not_found"; slug: string }
  | { status: "error"; slug: string; message: string };

export async function lookupToolkit(slug: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ToolkitLookup> {
  try {
    const res = await fetchImpl(`${BASE}/toolkits/${encodeURIComponent(slug)}`, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { status: "not_found", slug };
    if (!res.ok) return { status: "error", slug, message: `Composio answered HTTP ${res.status}` };
    const body = (await res.json()) as { composio_managed_auth_schemes?: unknown };
    const raw = body.composio_managed_auth_schemes;
    const managedSchemes = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    return { status: "found", slug, managedSchemes };
  } catch (e) {
    return { status: "error", slug, message: e instanceof Error ? e.message : String(e) };
  }
}

export type ManagedAuthFinding = {
  managedAuth: "available" | "not_available" | "unknown";
  note: string;
  test: { what: string; result: "passed" | "failed" | "not_tested"; note: string };
};

/** Turn a lookup (or its absence) into the guide's `composio` facts and a `tested` entry. */
export function describeLookup(lookup: ToolkitLookup | undefined, today: string): ManagedAuthFinding {
  const what = "GET /api/v3.1/toolkits/{slug} to check managed auth";
  if (!lookup) {
    return { managedAuth: "unknown", note: "Not checked: no Composio key was configured.", test: { what, result: "not_tested", note: "No COMPOSIO_API_KEY was configured." } };
  }
  if (lookup.status === "error") {
    return { managedAuth: "unknown", note: `Composio lookup failed (${lookup.message}).`, test: { what, result: "failed", note: lookup.message } };
  }
  if (lookup.status === "not_found") {
    return {
      managedAuth: "unknown",
      note: `Composio has no toolkit with the slug "${lookup.slug}" (checked ${today}); the slug may differ from the provider's name.`,
      test: { what, result: "passed", note: `Composio returned 404 for "${lookup.slug}".` },
    };
  }
  const oauth = lookup.managedSchemes.some((s) => s.toUpperCase().includes("OAUTH"));
  return {
    managedAuth: oauth ? "available" : "not_available",
    note: oauth
      ? `Composio reports a managed OAuth app for "${lookup.slug}" (schemes: ${lookup.managedSchemes.join(", ")}, checked ${today}). You may not need your own app.`
      : `Composio reports no managed OAuth app for "${lookup.slug}" (schemes: ${lookup.managedSchemes.join(", ") || "none"}, checked ${today}), so you need your own.`,
    test: { what, result: "passed", note: `Composio returned the toolkit "${lookup.slug}" with managed auth schemes: ${lookup.managedSchemes.join(", ") || "none"}.` },
  };
}
