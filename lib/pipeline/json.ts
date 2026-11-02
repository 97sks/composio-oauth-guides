import type { z } from "zod";

/** Pull one JSON object out of model text: a ```json fence, or the outermost braces. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found in the model's reply.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseWith<T>(schema: z.ZodType<T>, text: string): Parsed<T> {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}
