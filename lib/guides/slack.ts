import { GuideSchema, type Guide } from "../guide-schema";
import type { Evidence } from "./evidence";

/**
 * Slack OAuth app setup guide, researched 2026-11-03.
 * Evidence: 10 Slack pages fetched in full with Anthropic's web_fetch tool (none truncated),
 * each claim's quote checked against the raw text (see slackEvidence and scripts/verify-quotes.ts).
 * No setup was attempted, so no claim is "verified".
 */
export const slackGuide: Guide = GuideSchema.parse({
  slug: "slack",
  name: "Slack",
  website: "https://slack.com",
  developerPortalUrl: "https://api.slack.com/apps",
  origin: "library",
  lastChecked: "2026-11-03",

  verdict: {
    difficulty: "moderate",
    summary:
      "Creating the app and installing it in your own workspace is quick. Installing it in other companies' workspaces needs a checklist but no Slack review. Slack says apps meant for commercial distribution should be listed in the Marketplace; review is optional to get started, but unlisted commercial apps face much lower rate limits on conversation-history methods, and Marketplace review can take months.",
    effort: {
      label: "About 1 to 3 hours of your time for an unlisted app",
      minHours: 1,
      maxHours: 3,
      claimIds: ["k18"],
    },
    totalTime: {
      label: "Under 1 day to install in other workspaces. A Marketplace listing is optional and adds up to about 12 weeks.",
      minDays: 0,
      maxDays: 1,
      openEnded: false,
      claimIds: ["k18", "k16", "k10"],
    },
    wait: {
      kind: "none",
      label: "None for unlisted distribution; Marketplace review is optional",
      basis: "unpublished",
    },
    needsProviderApproval: false,
    confidence: "medium",
    confidenceNote:
      "Review times and rate limits come from Slack's own pages and were quote-checked, but no app was created and Slack's scope reference page could not be fetched.",
    claimIds: ["k16", "k10", "k13", "k14", "k18"],
  },

  requirements: [
    {
      label: "A Slack workspace to develop in",
      detail: "You create the app against a workspace; it lives in that one workspace until you activate public distribution.",
      claimIds: ["k1", "k8"],
    },
    {
      label: "An HTTPS redirect URL",
      detail: "The redirect URL must use HTTPS. With several redirect URLs configured, send the same redirect_uri in both the authorize and token steps.",
      claimIds: ["k4"],
    },
    {
      label: "A decision on token rotation",
      detail: "Without rotation, access tokens never expire; with rotation they expire every 12 hours and need refreshing. Turning it on cannot be undone.",
      claimIds: ["k6"],
    },
    {
      label: "For a Marketplace listing: a public support page and a privacy policy",
      detail:
        "Support requests are expected to get a response within 2 business days and the support page must be publicly accessible. The privacy policy must explain how third-party data is handled.",
      claimIds: ["k12"],
    },
  ],

  registration: {
    outputs: ["Client ID", "Client secret"],
    redirectRules: [
      "Must use HTTPS",
      "With multiple redirect URLs, send redirect_uri in both the authorize and token steps, with the same value",
    ],
    environmentLimits: [
      "An app resides in one workspace until public distribution is activated",
      "Unlisted commercial apps created after 29 May 2025, and new installs of existing ones: conversations.history and conversations.replies limited to 1 request per minute and 15 objects",
    ],
    claimIds: ["k1", "k4", "k8", "k13"],
  },

  scoping: {
    declaredWhere: "both",
    catalogUrl: "https://docs.slack.dev/reference/scopes",
    claimIds: ["k15"],
  },

  scopes: [
    {
      name: "chat:write",
      sensitivity: "not_applicable",
      needsReview: false,
      note: "Appears in Slack's docs examples. The scope reference page could not be fetched, so what it grants was not verified here.",
      claimIds: ["k20"],
    },
  ],

  approval: [
    {
      name: "Slack Marketplace review",
      appliesWhen:
        "You want a Marketplace listing. Slack says apps intended for commercial distribution should be listed; unlisted apps are not reviewed.",
      required: false,
      wait: {
        label:
          "Preliminary review up to 10 business days, then functional review up to 10 weeks for new submissions (6 weeks for resubmitted published apps); about 12 weeks at most",
        maxDays: 84,
        basis: "official",
      },
      interimLimits: [
        "Unlisted commercial apps: conversations.history and conversations.replies limited to 1 request per minute and 15 objects (new apps and new installs)",
        "Each resubmission resets your place in the queue",
      ],
      claimIds: ["k10", "k11", "k13", "k16"],
    },
    {
      name: "Workspace owner app approval",
      appliesWhen: "A customer's Workspace Owner has turned on app approval for their workspace.",
      required: false,
      wait: { label: "Not published; depends on the workspace owner", basis: "unpublished" },
      interimLimits: ["Members cannot install your app until it is approved"],
      claimIds: ["k14"],
    },
  ],

  execution: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    pkce: "supported",
    clientAuth: "body",
    refresh: {
      issued: "conditional",
      note: "Only with token rotation, which is opt-in and cannot be turned off once on. Rotated access tokens last 12 hours.",
    },
    accessTokenTtl: "No expiry by default; 12 hours with token rotation",
    extraAuthorizeParams: [
      { name: "user_scope", value: "<user_scope>", why: "User-token scopes are sent separately from bot scopes, which use scope=" },
    ],
    claimIds: ["k2", "k3", "k5", "k6", "k7"],
  },

  steps: [
    {
      id: "st1",
      stage: "registration",
      who: "you",
      title: "Create a Slack app in your development workspace",
      detail: "Open the apps page, choose Create an app, select Blank app, enter the app name and pick the workspace you will develop in.",
      url: "https://api.slack.com/apps?new_app=1",
      agentNote: "Needs your Slack login.",
      claimIds: ["k1"],
    },
    {
      id: "st2",
      stage: "scoping",
      who: "agent",
      title: "Choose the scopes your tools need",
      detail:
        "Request scopes in your app settings, and send the same scopes in the authorization URL: bot scopes as scope=, user scopes as user_scope=. Ask for as few as you can; unlisted and listed apps alike show them to the user.",
      agentNote:
        "The agent can compute least-privilege scopes for your enabled Composio tools. The full scope reference page could not be read here, so confirm each scope there.",
      claimIds: ["k15", "k2", "k20"],
    },
    {
      id: "st3",
      stage: "registration",
      who: "you",
      title: "Add the redirect URL under OAuth & Permissions",
      detail:
        "Add https://backend.composio.dev/api/v3/toolkits/auth/callback as a Redirect URL. It must use HTTPS. Then copy the client ID and client secret.",
      agentNote: "The secret should go straight into your secret store, not into chat.",
      claimIds: ["k4", "k3"],
    },
    {
      id: "st4",
      stage: "execution",
      who: "agent",
      title: "Create the Composio auth config and test in your own workspace",
      detail:
        "Create a use_custom_auth auth config for the slack toolkit with your client ID, secret and scopes, pass it in the session, and connect with a Connect Link until the account is ACTIVE. The authorization code Slack returns expires after ten minutes.",
      agentNote: "Runs through Composio's API once you hand over the credentials securely.",
      claimIds: ["k19", "k5"],
    },
    {
      id: "st5",
      stage: "approval",
      who: "you",
      title: "Complete the distribution checklist and activate public distribution",
      detail:
        "In Manage Distribution, complete every item on the checklist, then click Activate Public Distribution. You then get an Add to Slack button and a shareable install URL. Deactivating later removes the app from every workspace except the original one.",
      url: "https://api.slack.com/apps",
      agentNote: "Needs an app owner's session.",
      claimIds: ["k8", "k9", "k17"],
    },
    {
      id: "st6",
      stage: "approval",
      who: "you",
      title: "Ask customers whose workspaces require approval to approve your app",
      detail:
        "By default members can install apps without approval, but Workspace Owners can switch on app approval. Give the owner your app name and what it accesses.",
      agentNote: "The agent can draft the request text; only the Workspace Owner can approve.",
      claimIds: ["k14"],
    },
    {
      id: "st7",
      stage: "approval",
      who: "agent",
      title: "Prepare a Marketplace listing (optional but expected for commercial apps)",
      detail:
        "Draft the listing text, privacy policy and a public support page. Slack expects support requests to get a response within 2 business days.",
      agentNote: "The agent writes the drafts; you host the pages and staff the support channel.",
      claimIds: ["k12", "k16"],
    },
    {
      id: "st8",
      stage: "approval",
      who: "you",
      title: "Submit to the Slack Marketplace",
      detail: "Submit from your app settings. Slack runs a preliminary review, then a functional review.",
      agentNote: "Only an app owner can submit and answer reviewers.",
      claimIds: ["k10"],
    },
    {
      id: "st9",
      stage: "approval",
      who: "wait",
      title: "Wait for review",
      detail:
        "Preliminary feedback takes up to 10 business days; the functional review takes up to 10 weeks for new submissions and 6 weeks for resubmitted published apps. Slack cannot skip or accelerate the review, and each resubmission resets your place in the queue.",
      claimIds: ["k10", "k11"],
    },
  ],

  blockers: [
    {
      title: "Lower rate limits for unlisted commercial apps",
      detail:
        "For commercially distributed apps not approved for the Marketplace, created after 29 May 2025 or newly installed, conversations.history and conversations.replies are limited to 1 request per minute and 15 objects per request. Existing installations of unlisted apps were not affected.",
      fix: "Avoid depending on these methods, or get a Marketplace listing. Check the current limits before committing.",
      claimIds: ["k13"],
    },
    {
      title: "Slack expects commercial apps to be listed",
      detail:
        "Unlisted distribution is described as suited to pilots with early customers; apps intended for commercial distribution should be submitted and approved for listing.",
      fix: "Plan the Marketplace submission early if you are selling the integration.",
      claimIds: ["k16"],
    },
    {
      title: "Marketplace review is long and a resubmission restarts it",
      detail: "Up to 10 weeks for a new submission after the preliminary review; each resubmission resets your place in the queue.",
      fix: "Satisfy the preliminary feedback completely before resubmitting, and prepare the support page and privacy policy first.",
      claimIds: ["k10", "k11", "k12"],
    },
    {
      title: "Customer workspaces can require app approval",
      detail: "Workspace Owners can enable app approval, so enterprise customers may add their own delay.",
      fix: "Tell customers what your app accesses and ask their owner to approve it ahead of the rollout.",
      claimIds: ["k14"],
    },
    {
      title: "Token rotation and PKCE cannot be undone",
      detail:
        "Token rotation cannot be turned off once on. Enabling PKCE marks the app as a public client, which is one-way without contacting Slack support.",
      fix: "Test either change in a development app first; refresh rotated tokens within 12 hours.",
      claimIds: ["k6", "k7"],
    },
  ],

  composio: {
    toolkitSlug: "slack",
    managedAuth: "unknown",
    managedAuthNote:
      "Not checked against Composio's directory. A custom app adds your own branding and is the only way to control scopes and a Marketplace listing.",
    redirectUri: "https://backend.composio.dev/api/v3/toolkits/auth/callback",
    authConfigScopes: "chat:write",
  },

  claims: [
    {
      id: "k1",
      text: "To create an app: open the apps page, choose Create an app, select Blank app, enter the app name and select the workspace to develop in.",
      status: "sourced",
      sourceIds: ["s9"],
    },
    {
      id: "k2",
      text: "Authorize at https://slack.com/oauth/v2/authorize; bot scopes go in scope= and user scopes in user_scope=.",
      status: "sourced",
      sourceIds: ["s1"],
    },
    {
      id: "k3",
      text: "Exchange the code by calling https://slack.com/api/oauth.v2.access with code, client_id and client_secret as form fields.",
      status: "sourced",
      sourceIds: ["s1"],
    },
    {
      id: "k4",
      text: "The redirect_uri must use HTTPS; a Redirect URL configured under OAuth & Permissions must also use HTTPS; with several configured, the redirect_url parameter must be sent in both the authorize and access steps with the same value.",
      status: "sourced",
      sourceIds: ["s1"],
    },
    {
      id: "k5",
      text: "The temporary authorization code expires after ten minutes, and a returned state that does not match should be treated as a forgery.",
      status: "sourced",
      sourceIds: ["s1"],
    },
    {
      id: "k6",
      text: "Without token rotation the access token never expires; with it, tokens expire every 12 hours and are refreshed with a refresh token. Token rotation cannot be turned off once on.",
      status: "sourced",
      sourceIds: ["s7"],
    },
    {
      id: "k7",
      text: "Slack supports PKCE; enabling it marks the app as a public client, a one-way operation that cannot be disabled without contacting Slack support.",
      status: "sourced",
      sourceIds: ["s10"],
    },
    {
      id: "k8",
      text: "A new app resides in one workspace. To distribute it: open Manage Distribution, complete every item on the checklist, and click Activate Public Distribution.",
      status: "sourced",
      sourceIds: ["s2"],
    },
    {
      id: "k9",
      text: "Deactivating public distribution removes the app from any workspace that installed it, aside from the original associated workspace.",
      status: "sourced",
      sourceIds: ["s2"],
    },
    {
      id: "k10",
      text: "Marketplace review: the preliminary part takes up to 10 business days to give feedback; the functional review takes up to 10 weeks for new submissions and 6 weeks for published apps resubmitting changes.",
      status: "sourced",
      sourceIds: ["s4", "s5"],
    },
    {
      id: "k11",
      text: "Slack cannot skip or accelerate the review, turnaround varies with volume, and the place in the queue resets each time you resubmit.",
      status: "sourced",
      sourceIds: ["s4", "s5"],
    },
    {
      id: "k12",
      text: "Marketplace apps need a clear privacy policy, a publicly accessible support page, and support requests answered within 2 business days.",
      status: "sourced",
      sourceIds: ["s3"],
    },
    {
      id: "k13",
      text: "For commercially distributed apps not approved for the Marketplace, conversations.history and conversations.replies are limited to 1 request per minute and 15 objects per request for apps created after 29 May 2025 and for new installations; existing installations of unlisted apps (excluding internal customer-built apps) are not impacted.",
      status: "sourced",
      sourceIds: ["s6"],
    },
    {
      id: "k14",
      text: "By default members can install apps without approval from a Workspace Owner; Workspace Owners can enable app approval.",
      status: "sourced",
      sourceIds: ["s8"],
    },
    {
      id: "k15",
      text: "Scopes are requested in the app settings and specified during the OAuth flow.",
      status: "sourced",
      sourceIds: ["s1", "s9"],
    },
    {
      id: "k16",
      text: "Unlisted distribution is not reviewed: Slack says apps listed in the Marketplace are reviewed 'unlike unlisted distributed apps', and that apps intended for commercial distribution should be submitted and approved for listing.",
      status: "sourced",
      sourceIds: ["s2"],
    },
    {
      id: "k17",
      text: "Activating public distribution gives you an embeddable Add to Slack button and a shareable URL that starts the installation.",
      status: "sourced",
      sourceIds: ["s2"],
    },
    {
      id: "k18",
      text: "Estimate: 1 to 3 hours of hands-on work for an unlisted app (create the app, add scopes and redirect URL, create the auth config, complete the distribution checklist), finishing the same day.",
      status: "uncertain",
      sourceIds: ["s9", "s2"],
      note: "Agent estimate from the length of the steps in Slack's quickstart and distribution pages. Not a measured time.",
    },
    {
      id: "k19",
      text: "With Composio, register https://backend.composio.dev/api/v3/toolkits/auth/callback as the provider redirect URL, create a use_custom_auth auth config with your client ID, secret and scopes, pass it as auth_configs in the session, and test with a Connect Link until the account is ACTIVE.",
      status: "uncertain",
      sourceIds: ["s11"],
      note: "From Composio docs read on 2026-10-30; s11 is the directory page, not the exact page for each step.",
    },
    {
      id: "k20",
      text: "chat:write appears as a bot scope in Slack's manifest example; what it grants was not checked on the scope reference page, which could not be fetched.",
      status: "uncertain",
      sourceIds: ["s1"],
      note: "https://docs.slack.dev/reference/scopes/chat.postMessage returned url_not_accessible.",
    },
  ],

  sources: [
    { id: "s1", title: "Installing with OAuth (Slack Docs)", url: "https://docs.slack.dev/authentication/installing-with-oauth", kind: "official", retrieved: "2026-11-03" },
    { id: "s2", title: "App lifecycle & distribution (Slack Docs)", url: "https://docs.slack.dev/app-management/distribution/", kind: "official", retrieved: "2026-11-03" },
    { id: "s3", title: "Slack Marketplace app guidelines and requirements (Slack Docs)", url: "https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements/", kind: "official", retrieved: "2026-11-03" },
    { id: "s4", title: "Slack Marketplace review guide (Slack Docs)", url: "https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide", kind: "official", retrieved: "2026-11-03" },
    { id: "s5", title: "Distributing your app in the Slack Marketplace (Slack Docs)", url: "https://docs.slack.dev/slack-marketplace/distributing-your-app-in-the-slack-marketplace", kind: "official", retrieved: "2026-11-03" },
    { id: "s6", title: "Rate limit changes for non-Marketplace apps (Slack changelog)", url: "https://api.slack.com/changelog/2025-05-terms-rate-limit-update-and-faq", kind: "official", retrieved: "2026-11-03" },
    { id: "s7", title: "Using token rotation (Slack Docs)", url: "https://docs.slack.dev/authentication/using-token-rotation", kind: "official", retrieved: "2026-11-03" },
    { id: "s8", title: "Manage app approval for your workspace (Slack Help Center)", url: "https://slack.com/help/articles/222386767", kind: "official", retrieved: "2026-11-03" },
    { id: "s9", title: "Quickstart: app settings (Slack Docs)", url: "https://docs.slack.dev/app-management/quickstart-app-settings/", kind: "official", retrieved: "2026-11-03" },
    { id: "s10", title: "Using PKCE (Slack Docs)", url: "https://docs.slack.dev/authentication/using-pkce", kind: "official", retrieved: "2026-11-03" },
    { id: "s11", title: "Composio managed auth directory (Composio Docs)", url: "https://docs.composio.dev/toolkits/managed-auth", kind: "vendor", retrieved: "2026-10-30" },
  ],

  tested: [
    {
      what: "Fetch and read the cited Slack pages in full",
      result: "passed",
      note: "On 2026-11-03, 10 pages were fetched with Anthropic's web_fetch tool at a 100,000-token limit. None was truncated, and every claim's quote was matched against the raw text (see scripts/verify-quotes.ts). One further page, the chat.postMessage scope reference, failed with url_not_accessible.",
    },
    {
      what: "Create a Slack app and install it in a workspace",
      result: "not_tested",
      note: "Needs a logged-in Slack account; not attempted.",
    },
    {
      what: "Submit an app to the Slack Marketplace",
      result: "not_tested",
      note: "Not attempted. No review outcome or real timing was observed.",
    },
    {
      what: "GET /api/v3.1/toolkits/slack to check managed auth",
      result: "not_tested",
      note: "No Composio API key was available.",
    },
  ],

  openQuestions: [
    "What each Slack scope grants: the scope reference page could not be fetched.",
    "Whether the current rate limits page still states the conversations.history change; the changelog does, but the rate limits page read did not mention it.",
    "How Marketplace review time compares in practice with the posted maximums.",
    "Whether Composio's managed Slack app is on the managed list.",
  ],

  run: {
    source: "manual_research",
    model: "claude-sonnet-5-5",
    inputTokens: 157912,
    outputTokens: 1017,
    costUsd: 0.326,
    stages: [{ stage: "fetch (13 page reads)", calls: 13, inputTokens: 157912, outputTokens: 1017, costUsd: 0.326 }],
    note: "Metered: the web_fetch calls only, priced from published rates (not billing). Not included: the web searches used to find the pages, and the extraction, claim-writing and assembly, which were done by hand in this session and not metered.",
  },
});

export const slackEvidence: Evidence[] = [
  { claimId: "k1", sourceId: "s9", quote: "Select **Blank app**. Click **Continue**." },
  { claimId: "k1", sourceId: "s9", quote: "where you'll be developing your app" },
  { claimId: "k2", sourceId: "s1", quote: "Bot scopes should be added as `scope=<bot_scope>`, and user scopes should be added as `user_scope=<user_scope>`" },
  { claimId: "k3", sourceId: "s1", quote: "curl -F code=1234 -F client_id=3336676.569200954261 -F client_secret=ABCDEFGH https://slack.com/api/oauth.v2.access" },
  { claimId: "k4", sourceId: "s1", quote: "The `redirect_uri` must use HTTPS." },
  { claimId: "k4", sourceId: "s1", quote: "A Redirect URL must also use HTTPS." },
  { claimId: "k4", sourceId: "s1", quote: "parameter must be sent in both the **Authorize** and **Access** steps" },
  { claimId: "k5", sourceId: "s1", quote: "which expires after ten minutes" },
  { claimId: "k5", sourceId: "s1", quote: "consider the authorization a forgery" },
  { claimId: "k6", sourceId: "s7", quote: "Without token rotation, the access token never expires. With token rotation, it expires every 12 hours." },
  { claimId: "k6", sourceId: "s7", quote: "off once it's turned on" },
  { claimId: "k7", sourceId: "s10", quote: "PKCE marks your app as a public client, which is is a one-way operation. It cannot be disabled without contacting Slack support." },
  { claimId: "k8", sourceId: "s2", quote: "Ensure all items in the supplied checklist are completed." },
  { claimId: "k8", sourceId: "s2", quote: "Click **Activate Public Distribution**." },
  { claimId: "k9", sourceId: "s2", quote: "This will remove the app from any workspaces that have installed it, aside from the original associated workspace." },
  { claimId: "k10", sourceId: "s4", quote: "the preliminary part of the review takes up to 10 business days to receive feedback, while the functional review takes up to 10 weeks for new submissions and 6 weeks for published apps resubmitting changes" },
  { claimId: "k10", sourceId: "s5", quote: "Feedback from this part of the review generally takes up to 10 business days" },
  { claimId: "k11", sourceId: "s4", quote: "We are unable to skip or accelerate the review process in order to coordinate with your launch." },
  { claimId: "k11", sourceId: "s5", quote: "Your place in the queue is reset each time you resubmit" },
  { claimId: "k12", sourceId: "s3", quote: "We expect support requests to receive a response within **2 business days**." },
  { claimId: "k12", sourceId: "s3", quote: "Your support page needs to be publicly accessible" },
  { claimId: "k12", sourceId: "s3", quote: "All Slack Marketplace apps must include a clear privacy policy that details how third-party data is handled" },
  { claimId: "k13", sourceId: "s6", quote: "The new rate limits will be updated to allow 1 request per minute and will return a maximum of 15 objects per request." },
  { claimId: "k13", sourceId: "s6", quote: "Existing installations of apps distributed outside the Marketplace (excluding internal customer-built apps) will not be impacted." },
  { claimId: "k14", sourceId: "s8", quote: "by default, members can install them without approval from a Workspace Owner" },
  { claimId: "k15", sourceId: "s1", quote: "During the OAuth flow, you specify which" },
  { claimId: "k15", sourceId: "s9", quote: "2. Requesting scopes" },
  { claimId: "k16", sourceId: "s2", quote: "Unlike unlisted distributed apps, apps listed in the Slack Marketplace are reviewed against our" },
  { claimId: "k16", sourceId: "s2", quote: "apps intended for commercial distribution should be submitted and approved for listing in the Slack Marketplace" },
  { claimId: "k17", sourceId: "s2", quote: "an embeddable **Add to Slack** button, a shareable URL that kicks off the installation process when clicked" },
  { claimId: "k20", sourceId: "s1", quote: "\"scopes\": { \"bot\": [ \"commands\", \"chat:write\"" },
];
