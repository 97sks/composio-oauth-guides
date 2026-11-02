import type { Topic } from "../discover";

export const EXTRACT_SYSTEM =
  "You extract checkable facts from provider documentation for a developer guide. " +
  "Fetch each given URL with the web_fetch tool, read it, then reply with one JSON object and nothing else. " +
  "Every fact needs a quote copied EXACTLY, character for character, from the fetched page text: no paraphrase, no ellipses, no markdown you added, at least 15 characters. " +
  "If the page does not say it, do not state it. One fact is one checkable statement. Prefer the page's own numbers and wording for limits, durations and requirements.";

const QUESTIONS: Record<Topic, string[]> = {
  registration: [
    "Exact console path to create the OAuth app, and each field on the form (which are required)",
    "Redirect/callback URL rules: exact match, http vs https, localhost, count allowed",
    "What credentials are issued, and how the client secret is created or rotated",
    "Who can own an app, and limits on the number of apps or test users",
  ],
  flow: [
    "Authorization URL and token URL",
    "Whether PKCE is supported or required, and which methods",
    "How client credentials are sent on the token request",
    "Access token lifetime, whether refresh tokens are issued, and when they stop working",
    "Extra authorize parameters needed for refresh tokens",
  ],
  scopes: [
    "Where scopes are declared: in the console, in the authorize request, or both",
    "Scope names with their meaning, and any that are sensitive, restricted or need review",
  ],
  review: [
    "Whether any review, verification, publishing or marketplace step exists and what triggers it",
    "How long it takes (copy any official duration exactly) and whether the provider says it is guaranteed",
    "What you must submit (privacy policy, domain proof, demo video, security assessment) and anything recurring",
    "What is limited while unapproved (user caps, warning screens, token expiry)",
    "Whether workspace or organization admins must approve the app",
  ],
  limits: ["Rate limits or app limits that apply to OAuth apps, and who they apply to"],
};

export function extractUser(topic: Topic, urls: string[]): string {
  return `Topic: ${topic}

URLs to fetch:
${urls.map((u) => `- ${u}`).join("\n")}

Answer, where the pages say so:
${QUESTIONS[topic].map((q) => `- ${q}`).join("\n")}

Reply with JSON:
{"facts":[{"field":"<one of: registration.steps, registration.fields, registration.redirect, registration.credentials, registration.limits, scoping.where, scopes.list, approval.exists, approval.process, approval.wait, approval.requirements, approval.limits, approval.admin, execution.endpoints, execution.pkce, execution.client_auth, execution.tokens, execution.refresh, limits.rate, other>","text":"<one checkable statement>","url":"<the page URL>","quote":"<verbatim text from that page>"}]}`;
}
