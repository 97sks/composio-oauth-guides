# Composio System Design (reference for building the OAuth-setup guide experience)

Sources: composio.dev, docs.composio.dev (llms.txt, how-composio-works, authentication, configuring-sessions, sessions-via-mcp, custom-app-vs-managed-app, white-labeling-authentication, controlling-scopes, managing-multiple-connected-accounts, manually-authenticating, token-custody, toolkits/managed-auth, API reference for tool_router, auth_configs, connected_accounts, trigger_instances). Read 2026-10-30.
Not read: connected-account list/get/patch/delete/revoke pages, trigger list/delete/patch/types pages, auth-config list/get/patch/delete pages, programmatic-auth-configs, importing-existing-connections, SDK reference, meta-tools page, rate limits.

## 1. Positioning
- "Give your AI secure access to 1,500+ apps." Counts vary by page (1,000+ / 1,500+ / 1,600+).
- Composio For You: end users connect their own apps to Claude, ChatGPT, Cursor, etc.
- Composio Platform: developers embed integrations in their own agents/apps. This assignment targets the Platform developer.

## 2. Entity model
| Concept | Meaning | ID / notes |
|---|---|---|
| User | App's identifier for the end user | `user_id`; use a stable DB key, never "default" or email. Old name: entity ID |
| Toolkit | Collection of tools for one service | slug e.g. `github`, `gmail` |
| Tool | Action with input/output schema | `{TOOLKIT}_{ACTION}`, e.g. `GITHUB_CREATE_ISSUE` |
| Auth config | Per-toolkit blueprint: scheme, scopes, credentials (managed or own). One per toolkit, shared by all users | `ac_...`; schemes OAUTH2, API_KEY, BEARER_TOKEN (no refresh), BASIC |
| Connected account | One user's stored credentials for one auth config | `ca_...`; status ACTIVE, INITIATED, EXPIRED, FAILED, INACTIVE, REVOKED; optional alias; visibility PRIVATE (default) or SHARED |
| Session | Runtime context for an agent run: user, tool access, auth, execution state | `composio.create(user_id)`; `composio.use(session_id)`; persistent |
| Meta tools | Fixed set in every session: `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL` | agent discovers, authenticates, executes at runtime |
| Trigger type / instance | Template (e.g. `GITHUB_COMMIT_EVENT`) / per-user-per-account subscription | `ti_...`; needs a project webhook URL |
| Sandbox | Remote workbench, sizes 1/1 to 8/8 vCPU/GB | not billed yet |
| Proxy Execute | Raw authenticated provider call; Composio injects token | needs "Proxy execute" API key permission |

Terminology map: entity->user, action->tool, app->toolkit, integration->auth config, connection->connected account.

## 3. Architecture (request path)
```
End user ──> Developer app / agent (user_id)
                 │  SDK (Python `composio`, TS `@composio/core`) + provider adapter
                 ▼
          Composio API  https://backend.composio.dev/api/v3.1   (x-api-key)
           ├─ Tool Router: sessions, meta tools, execute
           ├─ Auth: auth configs, connected accounts, Connect Link
           ├─ Triggers/webhooks
           └─ Credential store (AES-256-GCM at rest, TLS in transit)
                 │ injects token server-side
                 ▼
          Provider API (GitHub, Gmail, ...)   <── OAuth app (Composio-managed or developer's own)
```
Integration paths: (1) native tools via session + provider (recommended), (2) MCP via `session.mcp.url` + headers, (3) legacy direct execution (`tools.get/execute`, needs toolkit version).
The app and model only see tool results, never tokens.

## 4. OAuth and auth: the core of the assignment
### Two ownership options for the provider OAuth app
- **Composio-managed**: no provider registration. Shared quota across all Composio users, 2-minute minimum trigger polling, Composio branding on consent screen.
- **Custom (bring your own OAuth app)**: developer registers the app with the provider. Gains consent-screen branding, custom scopes, own rate limits, faster polling, regional or custom instances. Token custody is unchanged: Composio still stores and refreshes tokens.
- Mixed per toolkit is allowed. Toolkits not listed in `auth_configs` keep managed auth.

### Managed OAuth directory (`docs.composio.dev/toolkits/managed-auth`)
- Two tables, columns only Toolkit and Slug: "Composio-managed OAuth available (125)" and "Bring your own OAuth app (262)". No scheme, redirect URI, or per-row flag.
- Programmatic check: `GET /api/v3.1/toolkits/{slug}`, read `composio_managed_auth_schemes`.
- The 262 BYO apps are the natural pool for "developer must create an OAuth app and maybe get it approved". This is where the guide library has the most value.

### Custom OAuth app setup facts (from docs)
1. Dashboard: Create Auth Config -> pick toolkit -> OAuth2 -> enable "Use your own developer credentials" -> enter Client ID/Secret -> copy `ac_...`.
2. Provider redirect URI to register: `https://backend.composio.dev/api/v3/toolkits/auth/callback`. Also set it as `oauth_redirect_uri`. A 302 forwarder from the developer's domain is allowed but must not exchange the code (it does not hide Composio).
3. Scopes (comma-separated) in `credentials.scopes`; must be approved in the provider portal. Changing scopes affects new connections only; existing users must re-auth.
4. Creating the auth config is not enough. Pass `auth_configs={"github": "ac_..."}` on session create.
5. API: `POST /api/v3.1/auth_configs` with `{"toolkit":{"slug":"github"},"auth_config":{"type":"use_custom_auth","authScheme":"OAUTH2","credentials":{"client_id","client_secret","scopes"}}}`. Managed with scope override: `type: "use_composio_managed_auth"`.
6. `POST /api/v3.1/tools/scopes/required` and `toolkits.recommend_scopes(...)` (experimental) give least-privilege scopes per tool.

### Connection flow
- **In chat**: agent calls `COMPOSIO_MANAGE_CONNECTIONS`, gets a Connect Link, user signs in on hosted page (`connect.composio.dev`), account stored, agent retries.
- **Manual**: `session.authorize("gmail")` -> `redirect_url`; REST `POST /tool_router/session/{id}/link {"toolkit","callback_url","alias"}`. Or `POST /connected_accounts/link {auth_config_id,user_id,callback_url}` -> `link_token, redirect_url, expires_at, connected_account_id`.
- **App-owned UI**: `POST /connected_accounts` with `state.authScheme=OAUTH2` (needs custom OAuth config; managed `initiate()` retired).
- Poll `GET /connected_accounts/{id}` or `session.wait_for_connection(60)`. Closing the link leaves status INITIATED until expiry.
- Callback gets `status` and `connected_account_id` as hints only. Verify server-side with `GET /connected_accounts?statuses=ACTIVE` and `is_disabled:false`.
- Optional identity verification: project verifier URL receives `session_uri`; server calls `POST /connected_accounts/complete_auth {session_uri,user_id}` (single use, 10 minutes).
- Lifecycle: tokens auto-refreshed; revoked or expired refresh token -> `EXPIRED`; webhook `composio.connected_account.expired` -> send a fresh Connect Link.
- Account selection precedence: `connectedAccounts` override > `authConfigs` override > existing toolkit auth config > new managed config > error. Multiple accounts: most recent wins unless `multi_account` is enabled (2-10 per toolkit; `require_explicit_selection` default is documented inconsistently).
- White-label: logo (square 256-1024 px PNG/JPEG) and theme in Project Settings, one per project; host stays `connect.composio.dev`; locales `en`, `es`, `zh-CN`. Provider consent screen identity comes from the OAuth app.

### Token custody
Default Composio Cloud holds encrypted credentials. Options: private VPC, self-hosted (Helm), customer-managed keys (AWS KMS, GCP KMS, Vault Transit). Credentials are redacted on read; no supported export. SOC 2 Type II (trust.composio.dev).

## 5. Session configuration
`toolkits` (enable/disable), `tools` (per toolkit), `tags` (`readOnlyHint`, `createHint`, `updateHint`, `destructiveHint` with disable or `require_approval`), `preload` (<~20 tools), `session_preset` (`DIRECT_TOOLS`), `manage_connections`, `sandbox`/`workbench`, `multi_account`, `auth_configs`, `connected_accounts`, `require_approval` (experimental; raises `ToolInputRequiredError`, resume with `input_responses` + `request_state`). PATCH merges some blocks and replaces `tools/toolkits/tags/preload/authConfigs/connectedAccounts`; `expected_config_version` gives 409 on conflict; config history and rollback exist.

## 6. API surface (base `https://backend.composio.dev/api/v3.1`, header `x-api-key`; also `x-org-api-key`, `x-user-api-key`)
- Tool Router: `POST/GET/PATCH/DELETE /tool_router/session[/{id}]`, `GET .../tools`, `POST .../execute {tool_slug,arguments}`, `POST .../link`
- Tools: `GET /tools`, `GET /tools/{slug}`, `POST /tools/execute/{slug}`, `POST /tools/execute/proxy`, `POST /tools/scopes/required`
- Toolkits: `GET /toolkits/{slug}` (includes `composio_managed_auth_schemes`, `get_current_user_endpoint`)
- Auth configs: `POST/GET /auth_configs`, `GET/PATCH/DELETE /auth_configs/{id}`
- Connected accounts: `POST /connected_accounts`, `/link`, `/complete_auth`, list/get/patch (alias)/delete/revoke
- Triggers: `POST /trigger_instances/{slug}/upsert {connected_account_id|user_id, trigger_config, egress_url}` + list/delete/patch/types; delivery via project webhook URL, routed by `metadata.trigger_slug`
- Execute result: `data, error, log_id, result_type (completed|failed)`; no top-level `successful`
- Errors: `error{message, code, slug, status, request_id, suggested_fix}`. Rate limit 2K-10K requests/min by plan.

## 7. MCP
`mcp=True` on session -> `session.mcp.url` + `session.mcp.headers` (`x-api-key` or `x-user-api-key`). Fixed-tool endpoint via `DIRECT_TOOLS` preset. Over MCP, `beforeExecute`/`afterExecute` hooks, `modifySchema`, and local custom tools do not run. Consumer paths: Cursor, Claude Code plugin, Codex, ChatGPT, Claude connector.

## 8. User-facing UX patterns worth reusing
- Hosted Connect Link with visible requested access; user can limit actions, require approval, remove a connection, view action log.
- Docs pattern: per-toolkit page at `/toolkits/<slug>.md`, `llms.txt` / `llms-index.txt` for agents, appended "notes for AI code generators" block on every page.
- Dashboard pattern: Create Auth Config wizard (toolkit -> scheme -> credentials -> `ac_` ID).
- Pricing: Hobby free, 100K tool calls/month.

## 9. Implications for the guide experience (derived, not from Composio)
- Library seed = managed-auth directory's "Bring your own OAuth app (262)" list; rows have only name and slug, so every other field (approval path, review time, scopes needing review, redirect rules) must come from provider docs and agent research, with sources and confidence.
- Every guide should end in Composio's fixed steps: register redirect URI `https://backend.composio.dev/api/v3/toolkits/auth/callback`, create `use_custom_auth` auth config, pass `auth_configs` in the session, test with Connect Link and verify `ACTIVE`. A generated guide can include ready-to-run snippets for these.
- Guide must separate agent-doable steps (check `GET /toolkits/{slug}`, draft app name/description/privacy URL, compute least-privilege scopes, create the auth config via API, run a Connect Link test) from human-only steps (provider account creation, identity or business verification, submitting for review, waiting).
- Claims to mark uncertain: the Composio docs contain internal inconsistencies (app counts, `require_explicit_selection` default), and the directory table was extracted by a model, so spot-check before quoting.
