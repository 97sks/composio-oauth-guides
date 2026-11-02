/** Offline check of lib/pipeline/fetch.ts against hand-built response blocks. Run: npx tsx tests/fetch-parse.test.ts */
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { estimateTokens, extractFetchResults, looksTruncated, normalize, quoteInPage } from "../lib/pipeline/fetch";

const ok = {
  type: "web_fetch_tool_result",
  tool_use_id: "srvtoolu_1",
  caller: { type: "direct" },
  content: {
    type: "web_fetch_result",
    url: "https://example.com/docs",
    retrieved_at: "2026-11-03T10:00:00Z",
    content: {
      type: "document",
      title: "Docs",
      citations: null,
      source: { type: "text", media_type: "text/plain", data: "The temporary “code” will\n expire   after 10 minutes. Done." },
    },
  },
} as unknown as Anthropic.ContentBlock;

const err = {
  type: "web_fetch_tool_result",
  tool_use_id: "srvtoolu_2",
  caller: { type: "direct" },
  content: { type: "web_fetch_tool_result_error", error_code: "url_not_accessible" },
} as unknown as Anthropic.ContentBlock;

const pdf = {
  type: "web_fetch_tool_result",
  tool_use_id: "srvtoolu_3",
  caller: { type: "direct" },
  content: {
    type: "web_fetch_result",
    url: "https://example.com/a.pdf",
    retrieved_at: null,
    content: { type: "document", title: null, citations: null, source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } },
  },
} as unknown as Anthropic.ContentBlock;

const text = { type: "text", text: "DONE", citations: null } as unknown as Anthropic.ContentBlock;

const { pages, problems } = extractFetchResults([text, ok, err, pdf]);
assert.equal(pages.length, 1);
assert.equal(pages[0].url, "https://example.com/docs");
assert.equal(pages[0].retrievedAt, "2026-11-03T10:00:00Z");
assert.deepEqual(problems, [
  { toolUseId: "srvtoolu_2", code: "url_not_accessible" },
  { toolUseId: "srvtoolu_3", code: "non_text_document" },
]);

// Quote matching survives curly quotes and whitespace, and rejects invented or too-short quotes.
assert.equal(quoteInPage(pages[0], 'The temporary "code" will expire after 10 minutes'), true);
assert.equal(quoteInPage(pages[0], "GitHub reviews every OAuth app within five business days"), false);
assert.equal(quoteInPage(pages[0], "will"), false);
assert.equal(normalize(" a—b\n c "), "a-b c");

// Truncation heuristic.
assert.equal(looksTruncated("x".repeat(8000), 2000), true);
assert.equal(looksTruncated("x".repeat(8000), 100_000), false);
assert.equal(looksTruncated("x".repeat(8000), null), false);
assert.equal(estimateTokens("abcd"), 1);

console.log("fetch parsing: all checks passed");
