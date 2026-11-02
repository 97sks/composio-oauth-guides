/** Offline end-to-end tests of the pipeline with a scripted fake model. Run: npx tsx tests/pipeline.test.ts */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_BUDGET } from "../lib/pipeline/config";
import { costOf } from "../lib/pipeline/budget";
import type { ModelClient } from "../lib/pipeline/anthropic";
import { runPipeline } from "../lib/pipeline/run";
import type { PipelineEvent } from "../lib/pipeline/types";
import { buildProviderDomains, registrableDomain } from "../lib/pipeline/domains";
import { extractJson } from "../lib/pipeline/json";
import { findLibraryGuide } from "../lib/guides";
import { resolveQuery } from "../lib/pipeline/resolve";

// ---- unit checks -----------------------------------------------------------------------------
assert.equal(registrableDomain("developers.acme.com"), "acme.com");
assert.equal(registrableDomain("docs.example.co.uk"), "example.co.uk");
const d = buildProviderDomains({ name: "Acme", website: "https://acme.com", proposed: ["acme.com", "acmecdn.net", "evil.com"] });
assert.deepEqual(d.official.sort(), ["acme.com", "acmecdn.net"]); // evil.com does not start with "acme"
assert.deepEqual(buildProviderDomains({ name: "Zed", userUrl: "https://zed.dev" }).official, ["zed.dev"]);
assert.deepEqual(extractJson('Here:\n```json\n{"a":1}\n```'), { a: 1 });
assert.throws(() => extractJson("no json here"));
assert.equal(findLibraryGuide("https://www.github.com/x")?.slug, "github");
assert.equal(findLibraryGuide("Google")?.slug, "gmail");
assert.equal(findLibraryGuide("notion"), undefined);
assert.equal(resolveQuery("linear.app/docs").userUrl, "https://linear.app");
assert.equal(resolveQuery("hub spot").name, "Hub Spot");

import { rules } from "../lib/pipeline/prompts/assemble";
assert.match(rules("c9"), /Never mark a path required out of caution/);
assert.match(rules("c9"), /claim c9/);

// ---- fake provider ---------------------------------------------------------------------------
const REG = "https://developers.acme.com/oauth/register";
const FLOW = "https://developers.acme.com/oauth/flow";
const REVIEW = "https://developers.acme.com/oauth/review";
const PAGES: Record<string, string> = {
  [REG]: "Open Settings, then Developer, then New App to register an OAuth app. Copy the client ID and secret.",
  [FLOW]: "Authorize at https://acme.com/oauth/authorize and exchange codes at https://acme.com/oauth/token. PKCE is supported.",
  [REVIEW]: "Apps that request admin scopes go through a manual review by Acme staff. Other apps go live at once.",
};
const DISCOVER_JSON = JSON.stringify({
  provider: { name: "Acme", website: "https://acme.com", developerPortalUrl: "https://developers.acme.com", officialDomains: ["acme.com"] },
  pages: [
    { topic: "registration", url: REG, title: "Register an app" },
    { topic: "flow", url: FLOW, title: "OAuth flow" },
    { topic: "review", url: REVIEW, title: "App review" },
    { topic: "review", url: "https://evil.example/fake", title: "Not official" },
  ],
});
const FACTS: Record<string, unknown[]> = {
  registration: [{ field: "registration.steps", text: "Create the app under Settings, Developer, New App.", url: REG, quote: "Open Settings, then Developer, then New App to register an OAuth app." }],
  flow: [{ field: "execution.endpoints", text: "Authorize and token URLs are on acme.com.", url: FLOW, quote: "Authorize at https://acme.com/oauth/authorize and exchange codes at https://acme.com/oauth/token." }],
  review: [
    { field: "approval.wait", text: "Reviews take five days.", url: REVIEW, quote: "Reviews take five business days to finish." }, // not on the page
    { field: "approval.process", text: "Apps requesting admin scopes get a manual review.", url: REVIEW, quote: "Apps that request admin scopes go through a manual review by Acme staff." },
  ],
};
const assembledOk = (claimIds = { reg: "c1", flow: "c2", review: "c4", composio: "c5" }) => ({
  verdict: {
    difficulty: "hard",
    summary: "Register in the developer settings. Admin scopes need a manual review.",
    effort: { label: "About 1-3 hours", minHours: 1, maxHours: 3, rationale: "One short form plus a review submission." },
    wait: { kind: "review", label: "Not published", basis: "unpublished" },
    confidence: "medium",
    confidenceNote: "One claim is uncertain.",
    claimIds: [claimIds.reg, claimIds.review],
  },
  requirements: [{ label: "An Acme account", detail: "You need a developer account.", claimIds: [claimIds.reg] }],
  registration: { outputs: ["Client ID", "Client secret"], redirectRules: [], environmentLimits: [], claimIds: [claimIds.reg] },
  scoping: { declaredWhere: "unknown", claimIds: [claimIds.flow] },
  scopes: [],
  approval: [{ name: "Manual review", appliesWhen: "Admin scopes", required: true, wait: { label: "Not published", basis: "unpublished" }, interimLimits: [], claimIds: [claimIds.review] }],
  execution: { authorizeUrl: "https://acme.com/oauth/authorize", tokenUrl: "https://acme.com/oauth/token", pkce: "supported", clientAuth: "unknown", refresh: { issued: "unknown" }, extraAuthorizeParams: [], claimIds: [claimIds.flow] },
  steps: [
    { id: "st1", stage: "registration", who: "you", title: "Register the app", detail: "Use https://backend.composio.dev/api/v3/toolkits/auth/callback.", claimIds: [claimIds.reg] },
    { id: "st2", stage: "approval", who: "you", title: "Submit for review", detail: "Needed for admin scopes.", claimIds: [claimIds.review] },
    { id: "st3", stage: "execution", who: "agent", title: "Create the Composio auth config", detail: "Then run a Connect Link test.", claimIds: [claimIds.composio] },
  ],
  blockers: [],
  composio: { authConfigScopes: "read" },
  openQuestions: ["How long the review takes."],
});

type Script = { assemble: string[]; repair?: string[]; searches?: number };
function fakeClient(script: Script): ModelClient & { calls: string[] } {
  const calls: string[] = [];
  const queue = { assemble: [...script.assemble], repair: [...(script.repair ?? [])] };
  const usage = (i: number, o: number, extra: object = {}) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: null, cache_creation_input_tokens: null, ...extra });
  const msg = (content: unknown[], u: object) => ({ content, usage: u, stop_reason: "end_turn" }) as unknown as Anthropic.Message;
  return {
    calls,
    messages: {
      async create(params) {
        const tools = (params.tools ?? []) as Array<{ type: string }>;
        const user = String((params.messages.at(-1) as { content: unknown }).content);
        if (tools.some((t) => t.type.startsWith("web_search"))) {
          calls.push("discover");
          return msg([{ type: "text", text: DISCOVER_JSON, citations: null }], usage(6000, 400, { server_tool_use: { web_search_requests: script.searches ?? 2, web_fetch_requests: 0 } }));
        }
        if (tools.some((t) => t.type.startsWith("web_fetch"))) {
          const topic = /Topic: (\w+)/.exec(user)![1];
          calls.push("extract:" + topic);
          const urls = [...user.matchAll(/- (https:\/\/\S+)/g)].map((m) => m[1]);
          const results = urls.map((u, i) => ({
            type: "web_fetch_tool_result", tool_use_id: `t${i}`, caller: { type: "direct" },
            content: { type: "web_fetch_result", url: u, retrieved_at: "2026-11-03T00:00:00Z", content: { type: "document", title: "Page", citations: null, source: { type: "text", media_type: "text/plain", data: PAGES[u] ?? "" } } },
          }));
          return msg([...results, { type: "text", text: JSON.stringify({ facts: FACTS[topic] ?? [] }), citations: null }], usage(4000, 300, { server_tool_use: { web_search_requests: 0, web_fetch_requests: urls.length } }));
        }
        const isRepair = user.startsWith("Your previous JSON failed");
        calls.push(isRepair ? "repair" : "assemble");
        const next = (isRepair ? queue.repair : queue.assemble).shift();
        assert.ok(next, "unexpected extra " + (isRepair ? "repair" : "assemble") + " call");
        return msg([{ type: "text", text: next, citations: null }], usage(9000, 5000));
      },
    },
  };
}

async function run(script: Script, budget = DEFAULT_BUDGET, query = "Acme", composio?: Parameters<typeof runPipeline>[0]["composio"]) {
  const client = fakeClient(script);
  const events: PipelineEvent[] = [];
  const result = await runPipeline({ query, client, model: "test-model", budget, composio, onEvent: (e) => events.push(e), today: "2026-11-03" });
  // DUMP_DIR=<dir> saves the event stream as NDJSON, the format POST /api/generate sends, for front-end checks.
  if (process.env.DUMP_DIR) {
    mkdirSync(process.env.DUMP_DIR, { recursive: true });
    writeFileSync(join(process.env.DUMP_DIR, `${result.status}-${events.length}.ndjson`), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
  return { client, events, result };
}

async function main() {
  // Library hit: no model calls, no cost.
  {
    const { client, result } = await run({ assemble: [] }, DEFAULT_BUDGET, "slack");
    assert.equal(result.status, "library");
    assert.equal(client.calls.length, 0);
    assert.equal(result.usage.costUsd, 0);
  }

  // Happy path.
  {
    const { client, events, result } = await run({ assemble: [JSON.stringify(assembledOk())] });
    assert.equal(result.status, "complete", JSON.stringify(result.status === "incomplete" ? result.errors : ""));
    if (result.status !== "complete") return;
    const g = result.guide;
    assert.equal(g.origin, "live");
    assert.equal(g.slug, "acme");
    assert.deepEqual(g.claims.slice(0, 5).map((c) => c.status), ["sourced", "sourced", "uncertain", "sourced", "uncertain"]);
    assert.match(g.claims[2].note ?? "", /Quote was not found/);
    assert.ok(!g.sources.some((s) => s.url.includes("evil.example")), "unofficial page was not fetched or cited");
    assert.equal(g.verdict.needsProviderApproval, true); // derived by code
    assert.equal(g.verdict.totalTime.openEnded, true);
    assert.equal(g.composio.redirectUri, "https://backend.composio.dev/api/v3/toolkits/auth/callback");
    assert.equal(g.tested.find((t) => t.what.startsWith("Fetch"))?.result, "passed");
    // Usage: discover 6000/400 + 3 extract calls 4000/300 + assemble 9000/5000, plus 2 searches.
    const expected = costOf({ inputTokens: 6000 + 3 * 4000 + 9000, outputTokens: 400 + 3 * 300 + 5000, cacheReadTokens: 0, cacheWriteTokens: 0, searches: 2 });
    assert.ok(Math.abs(result.usage.costUsd - expected) < 1e-9, `${result.usage.costUsd} vs ${expected}`);
    assert.equal(result.usage.fetches, 3);
    assert.equal(g.run?.source, "pipeline");
    assert.ok(Math.abs((g.run?.costUsd ?? 0) - Number(expected.toFixed(4))) < 1e-9);
    assert.deepEqual(Object.keys(result.usage.stages).sort(), ["assemble", "discover", "extract"]);
    assert.ok(client.calls.includes("extract:registration") && client.calls.includes("extract:review"));
    const order = events.filter((e) => e.type === "stage" && e.status === "start").map((e) => (e as { stage: string }).stage);
    assert.deepEqual(order, ["resolve", "discover", "extract", "claim", "assemble", "validate"]);
    assert.equal(events.at(-1)?.type, "done");
  }

  // Repair: first assemble cites an unknown claim; one repair fixes it.
  {
    const bad = assembledOk();
    bad.verdict.claimIds = ["c99"];
    const { client, result } = await run({ assemble: [JSON.stringify(bad)], repair: [JSON.stringify(assembledOk())] });
    assert.equal(result.status, "complete");
    assert.deepEqual(client.calls.filter((c) => c === "repair" || c === "assemble"), ["assemble", "repair"]);
    assert.equal(result.usage.stages.repair.calls, 1);
  }

  // Repair is limited to one try: a second bad reply returns an incomplete result with the errors.
  {
    const bad = assembledOk();
    bad.verdict.claimIds = ["c99"];
    const { client, result } = await run({ assemble: [JSON.stringify(bad)], repair: [JSON.stringify(bad)] });
    assert.equal(result.status, "incomplete");
    if (result.status === "incomplete") {
      assert.match(result.reason, /did not pass validation/);
      assert.ok(result.errors.some((e) => e.includes("c99")));
      assert.ok(result.claims.length >= 5, "partial claims are returned");
    }
    assert.equal(client.calls.filter((c) => c === "repair").length, 1);
  }

  // Unparseable assemble output goes to repair too.
  {
    const { result } = await run({ assemble: ["not json at all"], repair: [JSON.stringify(assembledOk())] });
    assert.equal(result.status, "complete");
  }

  // Budget stop: a tiny cost cap halts the run after discovery and returns an incomplete result.
  {
    const { client, result } = await run({ assemble: [] }, { ...DEFAULT_BUDGET, maxCostUsd: 0.005 });
    assert.equal(result.status, "incomplete");
    if (result.status === "incomplete") assert.match(result.reason, /cost limit/);
    assert.deepEqual(client.calls, ["discover"]);
  }

  // Composio lookup: managed OAuth found, with the key sent only as the x-api-key header.
  {
    const seen: { url: string; key?: string }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen.push({ url, key: (init?.headers as Record<string, string>)["x-api-key"] });
      return new Response(JSON.stringify({ composio_managed_auth_schemes: ["OAUTH2"] }), { status: 200 });
    }) as unknown as typeof fetch;
    const { result, events } = await run({ assemble: [JSON.stringify(assembledOk())] }, DEFAULT_BUDGET, "Acme", { apiKey: "test-key", fetch: fakeFetch });
    assert.equal(result.status, "complete");
    if (result.status === "complete") {
      assert.equal(result.guide.composio.managedAuth, "available");
      assert.match(result.guide.composio.managedAuthNote ?? "", /managed OAuth app/);
      assert.equal(result.guide.tested.find((x) => x.what.includes("toolkits"))?.result, "passed");
    }
    assert.deepEqual(seen, [{ url: "https://backend.composio.dev/api/v3.1/toolkits/acme", key: "test-key" }]);
    assert.ok(events.some((e) => e.type === "stage" && e.stage === "composio"));
    assert.ok(!JSON.stringify(events).includes("test-key"), "the key never appears in events");
  }
  // Composio 404 and failure both leave managed auth "unknown" without breaking the run.
  for (const [status, expectTest] of [[404, "passed"], [500, "failed"]] as const) {
    const f = (async () => new Response("{}", { status })) as unknown as typeof fetch;
    const { result } = await run({ assemble: [JSON.stringify(assembledOk())] }, DEFAULT_BUDGET, "Acme", { apiKey: "k", fetch: f });
    assert.equal(result.status, "complete");
    if (result.status === "complete") {
      assert.equal(result.guide.composio.managedAuth, "unknown");
      assert.equal(result.guide.tested.find((x) => x.what.includes("toolkits"))?.result, expectTest);
    }
  }
  // No key: "not_tested", as before.
  {
    const { result } = await run({ assemble: [JSON.stringify(assembledOk())] });
    if (result.status === "complete") assert.equal(result.guide.tested.find((x) => x.what.includes("toolkits"))?.result, "not_tested");
  }

  console.log("pipeline: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
