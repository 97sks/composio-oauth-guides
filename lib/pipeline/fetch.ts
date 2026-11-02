import type Anthropic from "@anthropic-ai/sdk";

/**
 * Fetch stage helpers. Page text is read from the `web_fetch_tool_result` blocks
 * of a Messages response, never from the model's own description of the page, so
 * what we hold is the raw fetched text and a quote check against it is meaningful.
 */

export type FetchedPage = {
  url: string;
  title: string | null;
  text: string;
  retrievedAt: string | null;
};

export type FetchProblem = { toolUseId: string; code: string };

export function extractFetchResults(content: Anthropic.ContentBlock[]): {
  pages: FetchedPage[];
  problems: FetchProblem[];
} {
  const pages: FetchedPage[] = [];
  const problems: FetchProblem[] = [];
  for (const block of content) {
    if (block.type !== "web_fetch_tool_result") continue;
    const result = block.content;
    if (result.type === "web_fetch_tool_result_error") {
      problems.push({ toolUseId: block.tool_use_id, code: result.error_code });
      continue;
    }
    const source = result.content.source;
    if (source.type !== "text") {
      problems.push({ toolUseId: block.tool_use_id, code: "non_text_document" }); // e.g. a PDF
      continue;
    }
    pages.push({
      url: result.url,
      title: result.content.title,
      text: source.data,
      retrievedAt: result.retrieved_at,
    });
  }
  return { pages, problems };
}

/** Whitespace, curly quotes and dash variants differ between a page and a model's quote. */
export function normalize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const MIN_QUOTE_CHARS = 15; // very short quotes match by accident

/** True only if the quote appears verbatim (modulo normalize) in the fetched text. */
export function quoteInPage(page: FetchedPage, quote: string): boolean {
  const q = normalize(quote);
  return q.length >= MIN_QUOTE_CHARS && normalize(page.text).includes(q);
}

/** Rough size; good enough to compare against `max_content_tokens`. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The API documents no truncation flag, so infer: if we set a limit and the text
 * is close to it, assume it was cut. Calibrate the 0.9 threshold with the spike.
 */
export function looksTruncated(text: string, maxContentTokens: number | null): boolean {
  return maxContentTokens != null && estimateTokens(text) >= 0.9 * maxContentTokens;
}

/** Same page, different spelling: scheme/host case, trailing slash, fragment. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url;
  }
}
