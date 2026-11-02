import { GuideSchema, type Guide } from "../guide-schema";
import type { Evidence } from "./evidence";

/**
 * Gmail (Google) OAuth app setup guide, researched 2026-11-03.
 * Evidence: 14 Google pages fetched in full with Anthropic's web_fetch tool (none truncated),
 * each claim's quote checked against the raw text (see googleEvidence and scripts/verify-quotes.ts).
 * No setup was attempted, so no claim is "verified".
 */
export const googleGuide: Guide = GuideSchema.parse({
  slug: "gmail",
  name: "Gmail (Google)",
  website: "https://developers.google.com/workspace/gmail",
  developerPortalUrl: "https://console.cloud.google.com/auth/clients",
  origin: "library",
  lastChecked: "2026-11-03",

  verdict: {
    difficulty: "hard",
    summary:
      "You can build and test with your own account straight away, but real users need Google's review. For an agent that reads mail (restricted scopes) expect brand verification, scope verification and an annual third-party security assessment: Google's own estimate is about 6 weeks, and it says estimates are not guaranteed. An app that only sends mail (a sensitive scope) skips the assessment and is estimated at 10 business days.",
    effort: {
      label: "About 1 to 3 days of your time, plus any security-assessment fixes",
      minHours: 8,
      maxHours: 24,
      claimIds: ["c29"],
    },
    totalTime: {
      label: "About 6 weeks or more for restricted scopes. Google gives estimates, not an upper bound.",
      minDays: 44,
      openEnded: true,
      claimIds: ["c29", "c1", "c3", "c4"],
    },
    wait: {
      kind: "assessment",
      label: "About 6 weeks for restricted scopes (Google's estimate, not guaranteed)",
      basis: "official",
    },
    needsProviderApproval: true,
    confidence: "medium",
    confidenceNote:
      "Timing and scope tiers come from Google's own pages and were quote-checked, but no submission was attempted and the security assessment's cost and effort were not found.",
    claimIds: ["c1", "c2", "c3", "c4", "c5", "c8", "c24"],
  },

  requirements: [
    {
      label: "A Google Cloud project with the Gmail API enabled",
      detail: "Your app needs a corresponding Google Cloud project, and the API has to be enabled before you can add its scopes.",
      claimIds: ["c20"],
    },
    {
      label: "A public home page and a privacy policy on the same domain",
      detail:
        "The home page must be publicly accessible and clearly relate to the app. The privacy policy must be hosted on the home page's domain, linked from the consent screen, and disclose how you access, use, store or share Google user data.",
      claimIds: ["c23"],
    },
    {
      label: "Verified ownership of your authorized domains",
      detail: "Verify the domains in Google Search Console with a Google Account that is an Owner or Editor of the project.",
      claimIds: ["c22"],
    },
    {
      label: "Branding on the consent screen",
      detail:
        "App name, user support email, logo, home page, privacy policy link, terms of service link, authorized domains and developer contact information.",
      claimIds: ["c21"],
    },
    {
      label: "A justification per sensitive or restricted scope, and a demo video",
      detail:
        "Explain how you use the data and why narrower scopes are not enough. The video must show the functionality, the OAuth flow and how each scope is used.",
      claimIds: ["c18"],
    },
    {
      label: "Check whether you qualify for an exception first",
      detail:
        "Verification is not required for personal use, development, testing or staging projects, apps that only use service-owned data, internal use within an organization, or domain-wide installation.",
      claimIds: ["c7"],
    },
    {
      label: "HTTPS redirect URIs",
      detail: "Redirect URIs must use HTTPS and cannot use raw IP addresses; localhost is exempt.",
      claimIds: ["c16"],
    },
  ],

  registration: {
    outputs: ["Client ID", "Client secret (web applications)"],
    redirectRules: [
      "Must use the HTTPS scheme; localhost URIs are exempt",
      "Hosts cannot be raw IP addresses; localhost IP addresses are exempt",
    ],
    environmentLimits: [
      "Testing status: up to 100 test users, tester warning screen, refresh tokens expire in 7 days",
      "Unverified apps: 100 new users in total after the unverified app screen",
    ],
    claimIds: ["c9", "c10", "c16", "c19"],
  },

  scoping: {
    declaredWhere: "both",
    catalogUrl: "https://developers.google.com/workspace/gmail/api/auth/scopes",
    claimIds: ["c17", "c8"],
  },

  scopes: [
    {
      name: "https://www.googleapis.com/auth/gmail.labels",
      sensitivity: "standard",
      needsReview: false,
      note: "See and edit email labels.",
      claimIds: ["c8"],
    },
    {
      name: "https://www.googleapis.com/auth/gmail.send",
      sensitivity: "sensitive",
      needsReview: true,
      note: "Send email on your behalf. The lightest scope that sends mail; sensitive, not restricted.",
      claimIds: ["c8", "c2"],
    },
    {
      name: "https://www.googleapis.com/auth/gmail.readonly",
      sensitivity: "restricted",
      needsReview: true,
      note: "View email messages and settings. Triggers the security assessment.",
      claimIds: ["c8", "c5"],
    },
    {
      name: "https://www.googleapis.com/auth/gmail.modify",
      sensitivity: "restricted",
      needsReview: true,
      note: "Read, compose and send, without permanent deletion.",
      claimIds: ["c8", "c5"],
    },
    {
      name: "https://www.googleapis.com/auth/gmail.metadata",
      sensitivity: "restricted",
      needsReview: true,
      note: "Labels and headers but not the body. Still restricted, so it is not a way around the assessment.",
      claimIds: ["c8", "c5"],
    },
    {
      name: "https://www.googleapis.com/auth/gmail.compose",
      sensitivity: "restricted",
      needsReview: true,
      note: "Manage drafts and send emails.",
      claimIds: ["c8", "c5"],
    },
  ],

  approval: [
    {
      name: "Brand verification",
      appliesWhen:
        "Your app is going to production with your own name and logo on the consent screen. It is also the first step of sensitive and restricted verification.",
      required: true,
      wait: { label: "2-3 business days (Google's estimate)", minDays: 2, maxDays: 3, basis: "official" },
      interimLimits: ["Users see the unverified app screen until the app is verified"],
      claimIds: ["c3", "c4", "c26"],
    },
    {
      name: "Sensitive scope verification",
      appliesWhen: "You use sensitive scopes (for example gmail.send) and no restricted scopes. Not needed if you use restricted scopes, which have their own path below.",
      required: false,
      wait: { label: "Up to 10 days; Google's FAQ estimates 10 business days", maxDays: 10, basis: "official" },
      interimLimits: ["Unverified app screen", "100 new users in total after the unverified app screen"],
      claimIds: ["c2", "c4", "c10"],
    },
    {
      name: "Restricted scope verification and security assessment",
      appliesWhen:
        "You use any restricted Gmail scope (readonly, modify, metadata, compose, insert, settings, or full mail access) and data passes through a server.",
      required: true,
      wait: {
        label: "About 6 weeks (Google's FAQ estimate); the docs say 'several weeks'. Not guaranteed.",
        minDays: 42,
        basis: "official",
      },
      recurring: "Annual re-verification, with an annual third-party security assessment",
      interimLimits: [
        "100 new users in total after the unverified app screen",
        "While in Testing: up to 100 test users and refresh tokens that expire in 7 days",
      ],
      claimIds: ["c1", "c4", "c5", "c6"],
    },
  ],

  execution: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    pkce: "unknown",
    clientAuth: "body",
    refresh: {
      issued: "conditional",
      note: "Needs offline access. Refresh tokens stop working if the user revokes, after six months unused, after a password change for tokens with Gmail scopes, or past 100 per account per client.",
    },
    accessTokenTtl: "Returned as expires_in in the token response",
    extraAuthorizeParams: [],
    claimIds: ["c13", "c14", "c15", "c11", "c12"],
  },

  steps: [
    {
      id: "st1",
      stage: "registration",
      who: "you",
      title: "Create or select a Google Cloud project and enable the Gmail API",
      detail: "Use a project owned by your company, not a personal one. Enable the Gmail API in the API Library before adding its scopes.",
      url: "https://console.cloud.google.com/apis/library",
      agentNote: "Needs your Google login and billing acceptance if prompted.",
      claimIds: ["c20"],
    },
    {
      id: "st2",
      stage: "registration",
      who: "agent",
      title: "Draft the home page, privacy policy and consent-screen text",
      detail:
        "The privacy policy has to be hosted on the home page's domain and say how Google user data is accessed, used, stored and shared. Draft the app name, description, support email text and policy sections.",
      agentNote: "The agent writes the drafts from your product details; you host the pages.",
      claimIds: ["c23", "c21"],
    },
    {
      id: "st3",
      stage: "registration",
      who: "you",
      title: "Register your app with Google Auth Platform and fill in branding",
      detail:
        "Register the app (this must come before creating a client), then enter the app name, support email, logo, home page, privacy policy, terms and authorized domains.",
      url: "https://console.developers.google.com/auth/clients",
      agentNote: "Submitting the console forms needs your session.",
      claimIds: ["c19", "c21"],
    },
    {
      id: "st4",
      stage: "registration",
      who: "you",
      title: "Verify your domains in Google Search Console",
      detail: "Use a Google Account that is an Owner or Editor of the project. Verification is needed before brand verification can pass.",
      url: "https://search.google.com/search-console/about",
      agentNote: "DNS or file proof of domain ownership can only come from you.",
      claimIds: ["c22"],
    },
    {
      id: "st5",
      stage: "registration",
      who: "you",
      title: "Create a Web application OAuth client",
      detail:
        "On the Clients page, choose CREATE CLIENT, pick Web application, add https://backend.composio.dev/api/v3/toolkits/auth/callback as an authorized redirect URI, then copy the client ID and secret.",
      agentNote: "The secret should go straight into your secret store, not into chat.",
      claimIds: ["c19", "c16", "c14"],
    },
    {
      id: "st6",
      stage: "scoping",
      who: "agent",
      title: "Pick the narrowest Gmail scopes and write the justification",
      detail:
        "Add the scopes on the Data Access page and write a justification for each sensitive or restricted one, including why a narrower scope is not enough. If you only send mail, gmail.send avoids the security assessment.",
      agentNote:
        "The agent maps your tools to scopes and drafts the justification text. Note that gmail.metadata is restricted too, so it is not a lighter alternative to gmail.readonly.",
      claimIds: ["c8", "c17", "c18"],
    },
    {
      id: "st7",
      stage: "execution",
      who: "agent",
      title: "Create the Composio auth config and test with test users",
      detail:
        "Create a use_custom_auth auth config for the gmail toolkit with your client ID, secret and scopes, pass it in the session, and connect a test user until the account is ACTIVE. In Testing status only listed test users (up to 100) can connect.",
      agentNote: "Runs through Composio's API once you hand over the credentials securely.",
      claimIds: ["c30", "c9"],
    },
    {
      id: "st8",
      stage: "approval",
      who: "agent",
      title: "Prepare the verification submission",
      detail:
        "Write the per-scope justification and a script for the demo video: the app name and client ID on screen, the full OAuth flow with the exact scopes you are submitting, and each scope in use.",
      agentNote: "The agent drafts the justification and a shot list; you record the video.",
      claimIds: ["c18", "c21"],
    },
    {
      id: "st9",
      stage: "approval",
      who: "you",
      title: "Submit for verification",
      detail: "Submit the brand and scope verification request from the console, with the video and justifications. Respond to Google's follow-ups quickly: timelines depend on your responsiveness.",
      agentNote: "Only an account owner can submit, and replies come to your developer contact email.",
      claimIds: ["c4", "c18"],
    },
    {
      id: "st10",
      stage: "approval",
      who: "you",
      title: "Complete the security assessment (restricted scopes only)",
      detail:
        "Apps that reach restricted data through a server need an annual assessment by a Google-approved third party under the CASA program. Cost and effort were not found on the pages read.",
      url: "https://appdefensealliance.dev/casa",
      agentNote: "Requires engaging an assessor and fixing findings in your own systems.",
      claimIds: ["c5", "c28"],
    },
    {
      id: "st11",
      stage: "approval",
      who: "wait",
      title: "Wait for brand and scope verification",
      detail:
        "Google's estimates are 2-3 business days for brand verification, 10 business days for sensitive scopes and 6 weeks for restricted scopes. All are described as not guaranteed.",
      claimIds: ["c1", "c2", "c3", "c4"],
    },
    {
      id: "st12",
      stage: "execution",
      who: "you",
      title: "Publish the app",
      detail: "Move the publishing status from Testing to In production with the Publish app button. Existing connections made in Testing may need to be redone.",
      agentNote: "Changing publishing status needs a project owner.",
      claimIds: ["c27", "c11"],
    },
  ],

  blockers: [
    {
      title: "Refresh tokens expire after 7 days in Testing",
      detail:
        "A project with an external consent screen in Testing status gets refresh tokens that expire in 7 days, unless only basic profile scopes are requested. A prototype works, then silently stops.",
      fix: "Treat Testing as a short-lived trial. Plan to publish, and use Composio's EXPIRED status to send users a fresh Connect Link.",
      claimIds: ["c11", "c9"],
    },
    {
      title: "Unverified app screen and a user cap",
      detail: "Until verification, users see the unverified app screen and only 100 new users in total can get past it.",
      fix: "Start verification early, and keep demos within test users.",
      claimIds: ["c10", "c26", "c25"],
    },
    {
      title: "Restricted scopes bring an annual security assessment",
      detail:
        "Any restricted Gmail scope, including gmail.metadata, makes the app subject to the annual third-party assessment and annual re-verification.",
      fix: "If your product only sends mail, use gmail.send. Otherwise budget for the assessment and check the CASA pages for cost.",
      claimIds: ["c5", "c6", "c8"],
    },
    {
      title: "Refresh tokens can be invalidated without notice",
      detail:
        "They stop working if the user revokes access, after six months unused, after a password change when the token has Gmail scopes, or when an account has more than 100 per client (the oldest is dropped without warning).",
      fix: "Handle the EXPIRED state and send a new Connect Link; avoid requesting new refresh tokens repeatedly for the same user.",
      claimIds: ["c12"],
    },
    {
      title: "Adding a scope later restarts the review for that scope",
      detail:
        "Do not send a newly added sensitive or restricted scope in requests until it is verified; unregistered or unverified scopes show the unverified app warning.",
      fix: "Add new scopes to the Data Access page first, submit them for verification, and only then request them.",
      claimIds: ["c17"],
    },
    {
      title: "Timelines depend on you",
      detail: "Google's estimates are not guaranteed and vary with developer responsiveness.",
      fix: "Keep the developer contact email monitored and answer reviewer questions the same day.",
      claimIds: ["c4"],
    },
  ],

  composio: {
    toolkitSlug: "gmail",
    managedAuth: "unknown",
    managedAuthNote:
      "Not checked against Composio's directory. If Composio's managed Google app covers your use, you can skip your own app and its verification; a custom app adds your own branding and scopes.",
    redirectUri: "https://backend.composio.dev/api/v3/toolkits/auth/callback",
    authConfigScopes:
      "https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send",
  },

  claims: [
    {
      id: "c1",
      text: "Restricted scope verification can potentially take several weeks, mainly because of the required annual third-party security assessment; Google's FAQ estimates 6 weeks.",
      status: "sourced",
      sourceIds: ["s3", "s14"],
    },
    {
      id: "c2",
      text: "Sensitive scope verification can take up to 10 days; Google's FAQ estimates 10 business days.",
      status: "sourced",
      sourceIds: ["s2", "s14"],
    },
    {
      id: "c3",
      text: "All apps must complete brand verification first, which typically takes 2-3 business days if branding information has changed.",
      status: "sourced",
      sourceIds: ["s3", "s14"],
    },
    {
      id: "c4",
      text: "Google's verification time estimates are not guaranteed and vary based on developer responsiveness.",
      status: "sourced",
      sourceIds: ["s14"],
    },
    {
      id: "c5",
      text: "Apps accessing restricted data from or through a third-party server must undergo an annual security assessment by a Google-approved third party.",
      status: "sourced",
      sourceIds: ["s3"],
    },
    {
      id: "c6",
      text: "Apps requesting restricted scopes data need to complete re-verification annually.",
      status: "sourced",
      sourceIds: ["s1"],
    },
    {
      id: "c7",
      text: "Exceptions to verification include personal use, development/testing/staging environments, service-owned data only, internal use within an organization, and domain-wide installation.",
      status: "sourced",
      sourceIds: ["s3"],
    },
    {
      id: "c8",
      text: "Gmail scope tiers: gmail.labels is non-sensitive; gmail.send is sensitive; gmail.readonly, gmail.compose, gmail.insert, gmail.modify, gmail.metadata, gmail.settings.basic, gmail.settings.sharing and https://mail.google.com/ are restricted.",
      status: "sourced",
      sourceIds: ["s4"],
    },
    {
      id: "c9",
      text: "A project with Testing publishing status is limited to up to 100 test users listed in the consent screen; it becomes In production after selecting Publish app.",
      status: "sourced",
      sourceIds: ["s12"],
    },
    {
      id: "c10",
      text: "Apps that present the unverified app screen are limited to 100 new users in total until verified.",
      status: "sourced",
      sourceIds: ["s12"],
    },
    {
      id: "c11",
      text: "An external-user-type project in Testing status is issued refresh tokens that expire in 7 days, unless only basic profile scopes are requested.",
      status: "sourced",
      sourceIds: ["s6"],
    },
    {
      id: "c12",
      text: "Refresh tokens stop working if unused for six months, after a password change when the token contains Gmail scopes, or past 100 refresh tokens per Google Account per client ID, where creating a new one invalidates the oldest without warning.",
      status: "sourced",
      sourceIds: ["s6"],
    },
    {
      id: "c13",
      text: "Authorize at https://accounts.google.com/o/oauth2/v2/auth (HTTPS only) and exchange the code at https://oauth2.googleapis.com/token.",
      status: "sourced",
      sourceIds: ["s5"],
    },
    {
      id: "c14",
      text: "In the token request, client_id and code are required and client_secret is listed as optional.",
      status: "sourced",
      sourceIds: ["s5"],
    },
    {
      id: "c15",
      text: "The web server flow page does not mention PKCE, so whether Google accepts it for this flow was not determined.",
      status: "uncertain",
      sourceIds: ["s5"],
      note: "Absence from one page (129,640 characters, not truncated). Other Google flow pages were not checked.",
    },
    {
      id: "c16",
      text: "Redirect URIs must use HTTPS (localhost exempt), and hosts cannot be raw IP addresses (localhost IPs exempt).",
      status: "sourced",
      sourceIds: ["s5"],
    },
    {
      id: "c17",
      text: "Scopes are added on the console's Data Access page and also sent in the authorization request; sending an unregistered scope shows the unverified app warning, and a new sensitive or restricted scope should not be requested until verified.",
      status: "sourced",
      sourceIds: ["s7"],
    },
    {
      id: "c18",
      text: "Requesting sensitive or restricted scopes requires a justification for each scope and a link to a demo video showing the functionality, the OAuth flow and how the scopes are used.",
      status: "sourced",
      sourceIds: ["s7", "s13"],
    },
    {
      id: "c19",
      text: "To create an OAuth client: open the Google Auth Platform Clients page, register your application first (required before creating a client), click CREATE CLIENT, choose the type and fill in the details.",
      status: "sourced",
      sourceIds: ["s11"],
    },
    {
      id: "c20",
      text: "An app needs a corresponding Google Cloud project, and the API must be enabled in the API Library before its scopes can be added.",
      status: "sourced",
      sourceIds: ["s13"],
    },
    {
      id: "c21",
      text: "The registration form asks for app name, user support email, logo, home page, privacy policy, terms of service, authorized domains and developer contact information.",
      status: "sourced",
      sourceIds: ["s13"],
    },
    {
      id: "c22",
      text: "Brand verification requires verifying ownership of the project's authorized domains in Google Search Console with an Owner or Editor account.",
      status: "sourced",
      sourceIds: ["s2"],
    },
    {
      id: "c23",
      text: "The home page must be publicly accessible and clearly relevant; the privacy policy must be hosted on the home page's domain, linked on the consent screen, and disclose how Google user data is accessed, used, stored or shared.",
      status: "sourced",
      sourceIds: ["s2"],
    },
    {
      id: "c24",
      text: "Apps requesting sensitive or restricted scopes probably need to complete verification unless their use qualifies for an exception.",
      status: "sourced",
      sourceIds: ["s2"],
    },
    {
      id: "c25",
      text: "You can continue to build and test while waiting for verification.",
      status: "sourced",
      sourceIds: ["s8"],
    },
    {
      id: "c26",
      text: "The app may show an unverified app screen before the consent screen when it uses unverified sensitive or restricted scopes.",
      status: "sourced",
      sourceIds: ["s8"],
    },
    {
      id: "c27",
      text: "A project's publishing status becomes In production after selecting the Publish app button.",
      status: "sourced",
      sourceIds: ["s12"],
    },
    {
      id: "c28",
      text: "The security assessment is run under the Cloud Application Security Assessment (CASA) program of the App Defense Alliance. The cost, tiers and effort were not read.",
      status: "sourced",
      sourceIds: ["s3", "s10"],
    },
    {
      id: "c29",
      text: "Estimate: 8 to 24 hours of hands-on work (project, branding, policy pages, domain verification, client, justifications, demo video, submission), excluding security-assessment remediation. Total time is at least about 44 days: 2 for brand verification plus Google's 6-week estimate for restricted scopes.",
      status: "uncertain",
      sourceIds: ["s13", "s14"],
      note: "Agent estimate derived from the submission checklist and Google's timing table. Not a measured time.",
    },
    {
      id: "c30",
      text: "With Composio, register https://backend.composio.dev/api/v3/toolkits/auth/callback as the provider redirect URI, create a use_custom_auth auth config with your client ID, secret and scopes, pass it as auth_configs in the session, and test with a Connect Link until the account is ACTIVE.",
      status: "uncertain",
      sourceIds: ["s15"],
      note: "From Composio docs read on 2026-10-30; s15 is the directory page, not the exact page for each step.",
    },
  ],

  sources: [
    { id: "s1", title: "OAuth App Verification Help Center (Google)", url: "https://support.google.com/cloud/answer/13463073", kind: "official", retrieved: "2026-11-03" },
    { id: "s2", title: "Sensitive scope verification (Google)", url: "https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification", kind: "official", retrieved: "2026-11-03" },
    { id: "s3", title: "Restricted scope verification (Google)", url: "https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification", kind: "official", retrieved: "2026-11-03" },
    { id: "s4", title: "Choose Gmail API scopes (Google)", url: "https://developers.google.com/workspace/gmail/api/auth/scopes", kind: "official", retrieved: "2026-11-03" },
    { id: "s5", title: "Using OAuth 2.0 for web server applications (Google)", url: "https://developers.google.com/identity/protocols/oauth2/web-server", kind: "official", retrieved: "2026-11-03" },
    { id: "s6", title: "Using OAuth 2.0 to access Google APIs (Google)", url: "https://developers.google.com/identity/protocols/oauth2", kind: "official", retrieved: "2026-11-03" },
    { id: "s7", title: "Manage App Data Access (Google Cloud Help)", url: "https://support.google.com/cloud/answer/15549135", kind: "official", retrieved: "2026-11-03" },
    { id: "s8", title: "Unverified apps (Google Cloud Help)", url: "https://support.google.com/cloud/answer/7454865", kind: "official", retrieved: "2026-11-03" },
    { id: "s10", title: "Cloud Application Security Assessment (App Defense Alliance)", url: "https://appdefensealliance.dev/casa", kind: "vendor", retrieved: "2026-11-03" },
    { id: "s11", title: "Manage OAuth Clients (Google Cloud Help)", url: "https://support.google.com/cloud/answer/15549257", kind: "official", retrieved: "2026-11-03" },
    { id: "s12", title: "Manage App Audience (Google Cloud Help)", url: "https://support.google.com/cloud/answer/15549945", kind: "official", retrieved: "2026-11-03" },
    { id: "s13", title: "Submitting your app for verification (Google Cloud Help)", url: "https://support.google.com/cloud/answer/13461325", kind: "official", retrieved: "2026-11-03" },
    { id: "s14", title: "OAuth App Verification FAQ (Google Cloud Help)", url: "https://support.google.com/cloud/answer/13463817", kind: "official", retrieved: "2026-11-03" },
    { id: "s15", title: "Composio managed auth directory (Composio Docs)", url: "https://docs.composio.dev/toolkits/managed-auth", kind: "vendor", retrieved: "2026-10-30" },
  ],

  tested: [
    {
      what: "Fetch and read the cited Google pages in full",
      result: "passed",
      note: "On 2026-11-03, 14 pages were fetched with Anthropic's web_fetch tool at a 100,000-token limit. None was truncated, and every claim's quote was matched against the raw text (see scripts/verify-quotes.ts).",
    },
    {
      what: "Create a Google Cloud project, OAuth client and consent screen",
      result: "not_tested",
      note: "Needs a logged-in Google account; not attempted.",
    },
    {
      what: "Submit an app for verification",
      result: "not_tested",
      note: "Not attempted. No verification outcome or real timing was observed.",
    },
    {
      what: "GET /api/v3.1/toolkits/gmail to check managed auth",
      result: "not_tested",
      note: "No Composio API key was available.",
    },
  ],

  openQuestions: [
    "Cost, tiers and effort of the CASA security assessment.",
    "Whether Google accepts PKCE on the web server flow.",
    "Whether Composio's managed Google app already covers your use, which would let you skip your own verification.",
    "Real elapsed time: Google's figures are estimates and none was observed.",
    "Whether adding a new scope to a verified app triggers a full or partial re-review.",
  ],

  run: {
    source: "manual_research",
    model: "claude-sonnet-5-5",
    inputTokens: 162003,
    outputTokens: 1048,
    costUsd: 0.335,
    stages: [{ stage: "fetch (14 page reads)", calls: 14, inputTokens: 162003, outputTokens: 1048, costUsd: 0.335 }],
    note: "Metered: the web_fetch calls only, priced from published rates (not billing). Not included: the web searches used to find the pages, and the extraction, claim-writing and assembly, which were done by hand in this session and not metered.",
  },
});

export const googleEvidence: Evidence[] = [
  { claimId: "c1", sourceId: "s3", quote: "the restricted scopes verification process can potentially take several weeks to complete" },
  { claimId: "c1", sourceId: "s14", quote: "upon user request. | 6 weeks |" },
  { claimId: "c2", sourceId: "s2", quote: "The sensitive scope verification process can take up to 10 days to complete" },
  { claimId: "c2", sourceId: "s14", quote: "| 10 Business days |" },
  { claimId: "c3", sourceId: "s3", quote: "which typically takes 2-3 business days, if branding information has changed" },
  { claimId: "c3", sourceId: "s14", quote: "domain ownership, etc. | 2-3 Business days |" },
  { claimId: "c4", sourceId: "s14", quote: "and will vary based on developer responsiveness" },
  { claimId: "c5", sourceId: "s3", quote: "must undergo an annual security assessment by a Google-approved third party" },
  { claimId: "c6", sourceId: "s1", quote: "need to complete “re-verification” annually" },
  { claimId: "c7", sourceId: "s3", quote: "Exceptions to verification requirements include personal use, development/testing/staging environments, service-owned data only, internal use within an organization, and domain-wide installation" },
  { claimId: "c8", sourceId: "s4", quote: "Send email on your behalf. | ### Restricted scopes" },
  { claimId: "c8", sourceId: "s4", quote: "`https://www.googleapis.com/auth/gmail.readonly` | View your email messages and settings." },
  { claimId: "c8", sourceId: "s4", quote: "`https://www.googleapis.com/auth/gmail.metadata` | View your email message metadata such as labels and headers, but not the email body." },
  { claimId: "c8", sourceId: "s4", quote: "`https://www.googleapis.com/auth/gmail.labels` | See and edit your email labels. | ### Sensitive scopes" },
  { claimId: "c9", sourceId: "s12", quote: "are limited to up to 100 test users listed in the OAuth consent screen" },
  { claimId: "c10", sourceId: "s12", quote: "100 new users in total, after the app presents the unverified app screen" },
  { claimId: "c11", sourceId: "s6", quote: "is issued a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile" },
  { claimId: "c12", sourceId: "s6", quote: "The refresh token has not been used for six months." },
  { claimId: "c12", sourceId: "s6", quote: "The user changed passwords and the refresh token contains Gmail scopes." },
  { claimId: "c12", sourceId: "s6", quote: "There is currently a limit of 100 refresh tokens per Google Account per OAuth 2.0 client ID." },
  { claimId: "c13", sourceId: "s5", quote: "Google's OAuth 2.0 endpoint is at `https://accounts.google.com/o/oauth2/v2/auth`" },
  { claimId: "c13", sourceId: "s5", quote: "call the `https://oauth2.googleapis.com/token` endpoint" },
  { claimId: "c14", sourceId: "s5", quote: "**Optional**<br>The client secret obtained from the Cloud Console" },
  { claimId: "c16", sourceId: "s5", quote: "Redirect URIs must use the HTTPS scheme, not plain HTTP. Localhost URIs (including localhost IP address URIs) are exempt from this rule." },
  { claimId: "c16", sourceId: "s5", quote: "Hosts cannot be raw IP addresses. Localhost IP addresses are exempted from this rule." },
  { claimId: "c17", sourceId: "s7", quote: "Using an unregistered scope, even if previously verified, will result in the user seeing the" },
  { claimId: "c17", sourceId: "s7", quote: "do not immediately include this scope in the list of scopes in your request to the Google OAuth 2.0 endpoint until it is verified" },
  { claimId: "c18", sourceId: "s7", quote: "you must provide justification for the request. Additionally, you must include a link to a demo video that demonstrates how these scopes will be used." },
  { claimId: "c18", sourceId: "s13", quote: "Provide a video that demonstrates the functionality, the OAuth flow of the app and shows how the scopes are being used" },
  { claimId: "c19", sourceId: "s11", quote: "This is required before creating a client." },
  { claimId: "c19", sourceId: "s11", quote: "Click CREATE CLIENT" },
  { claimId: "c20", sourceId: "s13", quote: "For your app to access and use Google OAuth APIs, it must have a corresponding" },
  { claimId: "c20", sourceId: "s13", quote: "Before you can add any Google product API scopes to your project, the respective APIs will need to be enabled" },
  { claimId: "c21", sourceId: "s13", quote: "This is the name of the app that would appear on the user's consent screen." },
  { claimId: "c21", sourceId: "s13", quote: "This should be the email address where the user can reach out for support." },
  { claimId: "c21", sourceId: "s13", quote: "Add authorized domains." },
  { claimId: "c22", sourceId: "s2", quote: "Use a Google Account that's associated with your API Console project as an Owner or an Editor" },
  { claimId: "c23", sourceId: "s2", quote: "Your home page must be publicly accessible, and not just accessible to your site's logged-in users." },
  { claimId: "c23", sourceId: "s2", quote: "The privacy policy must be visible to users, hosted within the same domain as your application's home page" },
  { claimId: "c24", sourceId: "s2", quote: "you probably need to complete the verification process unless your app's use qualifies for" },
  { claimId: "c25", sourceId: "s8", quote: "You can continue to build and test your app while waiting to complete verification." },
  { claimId: "c26", sourceId: "s8", quote: "The app or script might display an \"unverified app\" screen before it displays the consent screen." },
  { claimId: "c27", sourceId: "s12", quote: "is considered **In production** after selecting the **Publish app** button" },
  { claimId: "c28", sourceId: "s3", quote: "cloud application security assessment framework (CASA)" },
  { claimId: "c28", sourceId: "s10", quote: "Cloud Application Security Assessment (CASA)" },
];
