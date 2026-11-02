import { z } from "zod";
import { budgetFrom, readEnv } from "../../../lib/env";
import { findLibraryGuide } from "../../../lib/guides";
import { createClient } from "../../../lib/pipeline/anthropic";
import { runPipeline } from "../../../lib/pipeline/run";
import type { PipelineEvent } from "../../../lib/pipeline/types";

/** A live run can take a minute or two (search, parallel page reads, assembly). */
export const maxDuration = 300;

const Body = z.object({ query: z.string().trim().min(2).max(200) });

// In-memory limiter: good enough for one server instance, not for many serverless instances.
const hits = new Map<string, number[]>();
function overLimit(ip: string, perHour: number): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= perHour) {
    hits.set(ip, recent);
    return true;
  }
  hits.set(ip, [...recent, now]);
  return false;
}

/**
 * POST { query } -> newline-delimited JSON events: stage progress, running usage, and a final
 * "done" event carrying the result. Library guides cost nothing and are not rate limited.
 */
export async function POST(request: Request) {
  let env;
  try {
    env = readEnv();
  } catch (e) {
    return Response.json({ error: `Invalid server configuration: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
  if (!env.GENERATE_ENABLED) return Response.json({ error: "Guide generation is turned off on this server." }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send JSON like {\"query\":\"Linear\"} (2 to 200 characters)." }, { status: 400 });
  const { query } = parsed.data;

  // Library guides need no model, so they work even without a key.
  const isLibrary = Boolean(findLibraryGuide(query));
  if (!isLibrary && !env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server. Add it to .env.local (see .env.example)." }, { status: 503 });
  }
  if (!isLibrary) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (overLimit(ip, env.GENERATE_RATE_LIMIT_PER_HOUR)) {
      return Response.json({ error: `Rate limit reached: ${env.GENERATE_RATE_LIMIT_PER_HOUR} generations per hour.` }, { status: 429 });
    }
  }

  const client = env.ANTHROPIC_API_KEY
    ? createClient(env.ANTHROPIC_API_KEY)
    : { messages: { create: async () => { throw new Error("No API key configured."); } } };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PipelineEvent | { type: "error"; message: string }) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runPipeline({ query, client, model: env.PIPELINE_MODEL,
          budget: budgetFrom(env),
          composio: env.COMPOSIO_API_KEY ? { apiKey: env.COMPOSIO_API_KEY } : undefined,
          onEvent: send,
        });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
