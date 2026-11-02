# Library Lock List

The set of apps that get a hand-researched guide for the take-home demo. The assignment asks for "a few real apps with different setup challenges" ([ASSIGNMENT.md](../ASSIGNMENT.md)), so apps are chosen for how their setup differs, not for popularity.

Last updated: 2026-11-03

## Selection criteria

1. The provider supports OAuth, and a developer would plausibly create their own OAuth app (Composio's "Bring your own OAuth app" list, or a managed app where a custom one still adds value).
2. Each app has a different main obstacle, so together they cover the range from "nobody reviews you" to "you can be refused."
3. Public documentation is good enough to check claims against sources.

## The set

| # | App | Toolkit slug | Expected difficulty | Main obstacle | Status |
|---|---|---|---|---|---|
| 1 | GitHub | `github` | easy | No review. Org owner may need to approve the app. | **Guide done** (verdict: easy) |
| 2 | Notion | `notion` | moderate | Public integration needs hosted legal pages. Access is per page. | Left out on purpose: run live from the prototype and check |
| 3 | Slack | `slack` | hard | Instant in your own workspace. Marketplace review only to distribute. | **Guide done** (verdict: moderate, not hard) |
| 4 | Google (Gmail) | `gmail` | hard | Sensitive scopes: verification. Restricted scopes: annual third-party security assessment. | **Guide done** (verdict: hard) |
| 5 | LinkedIn | `linkedin` | gated | Access to most products is approval-gated; the provider decides. | Left out on purpose: run live from the prototype and check |

"Expected difficulty" is a hypothesis from prior knowledge. Research can change it, and the guide's own verdict is what counts.

## Fallbacks

| If this fails | Swap in | Why |
|---|---|---|
| LinkedIn sources are too thin | Meta (Facebook) or Zoom | Both have a documented app-review gate |
| An app turns out to be unsuitable | HubSpot | Free developer account, optional marketplace listing |

## Open checks before locking

- [ ] Check each slug against Composio's managed-auth directory and note whether it is on the managed list, the bring-your-own list, or both. Gmail is believed to be on the managed list (unconfirmed).
- [ ] Confirm each slug exists via `GET /api/v3.1/toolkits/{slug}` (needs a Composio API key).
- [ ] Research LinkedIn first. If official sources do not say how access is approved, use a fallback.

## Research progress

Guides are written to the schema in [lib/guide-schema.ts](../lib/guide-schema.ts).

| App | Research | Guide drafted | Checked against sources | Notes |
|---|---|---|---|---|
| GitHub | done | yes ([lib/guides/github.ts](../lib/guides/github.ts)) | docs read, nothing hands-on | 15 sourced, 4 uncertain claims. Setup not attempted. |
| Notion | not started | no (left for live generation) | no | The live-generation check. |
| Slack | done | yes ([lib/guides/slack.ts](../lib/guides/slack.ts)) | 10 pages read in full; 31 quotes matched | 17 sourced, 3 uncertain claims. Setup not attempted. Verdict moderate. |
| Google (Gmail) | done | yes ([lib/guides/google.ts](../lib/guides/google.ts)) | 14 pages read in full; 45 quotes matched | 27 sourced, 3 uncertain claims. Setup not attempted. |
| LinkedIn | not started | no (left for live generation) | no | The live-generation check. |

## Out of scope for this set

The other ~257 apps on the bring-your-own list. They appear as "no guide yet" entries that the live generator can fill.
