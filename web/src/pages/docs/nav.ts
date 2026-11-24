/**
 * Every documentation page, in reading order. This is the sidebar, the
 * previous and next links, the search index and the sitemap, so a page that
 * isn't listed here doesn't exist as far as the rest of the site is
 * concerned. `keywords` holds the words a reader is likely to type that the
 * title and summary don't already contain.
 */

export type DocPage = {
  /** Path below the documentation root. The index is "/". */
  slug: string;
  title: string;
  /** One line, shown in search, on section pages and as the page description. */
  summary: string;
  keywords?: string;
};

export type DocGroup = { title: string; blurb: string; pages: DocPage[] };

export const groups: DocGroup[] = [
  {
    title: "Get started",
    blurb: "What Issueit is, and the shortest path to a bug report landing in your tracker.",
    pages: [
      { slug: "/", title: "Introduction", summary: "Issueit collects bug reports from your product and delivers them to the tools you already use.", keywords: "docs home overview index" },
      { slug: "/quickstart", title: "Quickstart", summary: "A project, a script tag and a destination: a real report delivered in about five minutes.", keywords: "install setup first report snippet" },
      { slug: "/how-it-works", title: "How Issueit works", summary: "The path a report takes from a browser to an issue, and what happens at each step.", keywords: "architecture pipeline lifecycle outbox" },
      { slug: "/concepts", title: "Concepts", summary: "Organisations, projects, reports, destinations, deliveries, connections, groups and releases.", keywords: "glossary vocabulary model objects terms" },
    ],
  },
  {
    title: "Collect",
    blurb: "The ways a report gets in: the widget, the hosted form, the intake API, and Roblox.",
    pages: [
      { slug: "/collect/widget", title: "The widget", summary: "One script tag, a button in the corner, and the context a developer needs attached automatically.", keywords: "script tag embed install snippet button inline" },
      { slug: "/collect/widget-api", title: "Widget runtime", summary: "window.Issueit: identify a user, attach metadata, open the form from your own control.", keywords: "javascript api identify setMetadata open window" },
      { slug: "/collect/diagnostics", title: "Diagnostics capture", summary: "Console errors, network requests and steps from the moments before the report, and what is scrubbed.", keywords: "console network steps breadcrumbs redaction privacy capture" },
      { slug: "/collect/form", title: "Hosted form", summary: "A public page per project for QA, support replies and anywhere you can't add a script.", keywords: "hosted page link qa /r/ form" },
      { slug: "/collect/intake-api", title: "Intake API", summary: "POST a report from a server, a mobile app, a test suite or a CI job.", keywords: "rest curl post json multipart attachments" },
      { slug: "/collect/browser-tokens", title: "Browser tokens", summary: "Short-lived tokens so a single-page app can report while the project stays closed.", keywords: "it_ token spa short lived mint public" },
      { slug: "/collect/idempotency", title: "Idempotency and dry runs", summary: "Send the same report twice safely, and find out what would happen without storing anything.", keywords: "idempotency-key replay dry_run test retry queue" },
      { slug: "/collect/spam", title: "Spam and abuse", summary: "A public project id invites strangers: what intake refuses, what it holds back rather than delivering, and how to release it.", keywords: "spam abuse honeypot rate limit block blocked reporter quarantine held link farm throttle" },
      { slug: "/collect/roblox", title: "Roblox", summary: "A webhook address Roblox game servers can post to, and a Luau module for script errors and in-game reports.", keywords: "roblox luau httpservice discord webhook proxy game experience studio remoteevent" },
      { slug: "/collect/sdks", title: "SDKs", summary: "@issueit/node for servers and @issueit/react for an error boundary that files the bug.", keywords: "npm package express hono fastify error boundary react node" },
    ],
  },
  {
    title: "Deliver",
    blurb: "Where reports go, how they get there, and what happens when they don't.",
    pages: [
      { slug: "/deliver/destinations", title: "Destinations", summary: "Over 130 services: trackers, chat, help desks, on-call, email, spreadsheets and your own webhook.", keywords: "integrations github linear jira slack catalogue connect" },
      { slug: "/deliver/routing", title: "Routing and policy", summary: "Which reports a destination takes, what each one carries, and how hard Issueit tries.", keywords: "filters rules priority source environment policy backoff timeout" },
      { slug: "/deliver/outbox", title: "Retries and the outbox", summary: "One row per destination in PostgreSQL, claimed by a worker and retried for about ten hours.", keywords: "queue reliability skip locked attempts backoff worker" },
      { slug: "/deliver/webhooks", title: "Webhooks", summary: "Receive reports as signed JSON on your own endpoint, and develop against it locally.", keywords: "webhook endpoint post json events receiver listen" },
      { slug: "/deliver/signatures", title: "Verifying signatures", summary: "Check Issueit-Signature in Node, Python, Go, PHP or Ruby before you trust a request.", keywords: "hmac sha256 signature verify timestamp replay" },
      { slug: "/deliver/failures", title: "When delivery fails", summary: "Reading the delivery log, what retries and what doesn't, paused destinations and how to recover.", keywords: "failed error paused retry debug log troubleshooting" },
    ],
  },
  {
    title: "Work with reports",
    blurb: "The small amount of tracking Issueit does, so a report can be dealt with and closed.",
    pages: [
      { slug: "/reports/triage", title: "Triage", summary: "The inbox: assign, note, resolve, choose several, and the keyboard that does it faster.", keywords: "inbox assign notes keyboard shortcuts bulk status" },
      { slug: "/reports/duplicates", title: "Duplicates and fingerprints", summary: "A thousand reports of one fault become one bug, by title, by page or by your own key.", keywords: "grouping fingerprint dedupe group rules similar" },
      { slug: "/reports/releases", title: "Releases and source maps", summary: "Upload a build's maps and minified stacks read as your own files, even if the maps land later.", keywords: "sourcemap upload release build stack trace minified" },
      { slug: "/reports/emails", title: "Emails to reporters", summary: "Tell the person who reported the bug when it's fixed, from your own domain.", keywords: "reporter notify receipt resolved unsubscribe smtp" },
      { slug: "/reports/notifications", title: "Notifications", summary: "What Issueit emails you and your team: arrivals, paused destinations, digests and allowances.", keywords: "email alerts digest daily weekly preferences" },
      { slug: "/reports/retention", title: "Retention", summary: "What Issueit keeps, how long attachments and diagnostics live, and how to delete sooner.", keywords: "delete gdpr privacy storage attachments period" },
    ],
  },
  {
    title: "Automate",
    blurb: "Issueit from a terminal, a pipeline or an agent, with the same API the dashboard uses.",
    pages: [
      { slug: "/automate/tokens", title: "Account tokens", summary: "ak_live_ tokens, the scopes they carry, and fencing one to a single project.", keywords: "api key auth bearer scopes permissions ci" },
      { slug: "/automate/management-api", title: "Management API", summary: "The API behind the dashboard: projects, reports, destinations, deliveries and analytics.", keywords: "rest openapi endpoints curl orgs current pagination" },
      { slug: "/automate/mcp", title: "MCP server for agents", summary: "Hand a coding agent the bug with its console errors, requests and clicks, and let it fix it.", keywords: "model context protocol claude cursor agent tools prompts ai" },
      { slug: "/automate/llms", title: "Documentation for machines", summary: "llms.txt, every page as Markdown, and a JSON manifest of both.", keywords: "llms.txt llms-full markdown md agent crawler index manifest ai" },
      { slug: "/automate/cli", title: "Command line", summary: "issueit: watch reports arrive, forward webhooks to your laptop, upload maps, file a bug from a test.", keywords: "cli npx terminal tail listen login doctor health" },
      { slug: "/automate/config", title: "Config as code", summary: "A project's settings as a file you can review in a pull request and apply to staging and production.", keywords: "pull push json gitops infrastructure dry-run prune" },
      { slug: "/automate/monitoring", title: "Health and metrics", summary: "Point an alert at the question that matters: how old is the oldest thing still waiting.", keywords: "prometheus metrics health uptime sse events alerting" },
    ],
  },
  {
    title: "Reference",
    blurb: "The exact contract: every field, header, limit and code, as the server implements them.",
    pages: [
      { slug: "/reference/intake", title: "Intake API reference", summary: "Every field, response and status code of POST /v1/{project}/reports.", keywords: "fields schema request response 201 multipart base64" },
      { slug: "/reference/webhook-events", title: "Webhook events", summary: "The events, the headers and the full report payload, field by field.", keywords: "report.created resolved duplicate payload headers delivery id" },
      { slug: "/reference/errors", title: "Error codes", summary: "Every code intake and the management API return, and what to do about each.", keywords: "400 401 403 413 415 429 500 codes invalid_request rate_limited" },
      { slug: "/reference/limits", title: "Limits", summary: "Rate limits, body sizes, attachment allowances and what a plan changes.", keywords: "rate limit 429 quota attachments size monthly allowance" },
      { slug: "/reference/ids", title: "Object ids", summary: "The prefix on every id, and what it belongs to.", keywords: "prj rep dlv dst prefix opaque identifiers" },
      { slug: "/reference/attachments", title: "Attachment links", summary: "Signed links to screenshots and files, as they appear inside a delivered issue.", keywords: "signed url exp sig expiry screenshot image" },
      { slug: "/reference/egress", title: "Egress rules", summary: "What Issueit will and won't connect to when you give it a URL.", keywords: "ssrf private ip redirect dns rebinding security localhost" },
      { slug: "/reference/catalogue", title: "Catalogue API", summary: "The public list of every destination Issueit can deliver to.", keywords: "providers categories list public json" },
      { slug: "/reference/environment", title: "Environment variables", summary: "Every variable the server reads, its default and what it changes.", keywords: "env config APP_URL DATABASE_URL SMTP ENCRYPTION_KEY edition" },
    ],
  },
  {
    title: "Self-host",
    blurb: "Issueit is one container and a PostgreSQL database. Run it yourself, with every feature on.",
    pages: [
      { slug: "/self-host/install", title: "Install", summary: "Docker Compose, the four variables you must set, and the first account.", keywords: "docker compose postgres deploy setup install run" },
      { slug: "/self-host/oauth", title: "OAuth apps", summary: "Register an app per service so your team can connect accounts by signing in.", keywords: "client id secret callback redirect github slack jira" },
      { slug: "/self-host/operations", title: "Backups and operations", summary: "Backups, restores, upgrades, the daily round, and running the worker separately.", keywords: "backup restore upgrade migrate cron worker role scale" },
      { slug: "/self-host/editions", title: "Editions", summary: "What the self-hosted edition is, how it differs from the hosted service, and the licence.", keywords: "agpl licence open source selfhost hosted plans edition" },
    ],
  },
];

export const allPages: Array<DocPage & { group: string }> = groups.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })));

export const pageBySlug = new Map(allPages.map((p) => [p.slug, p]));

/** Reading order, for the previous and next links at the foot of a page. */
export function neighbours(slug: string) {
  const i = allPages.findIndex((p) => p.slug === slug);
  return { previous: i > 0 ? allPages[i - 1] : undefined, next: i >= 0 && i < allPages.length - 1 ? allPages[i + 1] : undefined };
}

/**
 * Where the single-page documentation's anchors used to point. Old links from
 * blog posts, emails and the dashboard still work; they land on the page that
 * now holds that material.
 */
export const legacyAnchors: Record<string, string> = {
  start: "/quickstart",
  widget: "/collect/widget",
  form: "/collect/form",
  api: "/collect/intake-api",
  keys: "/automate/tokens",
  agents: "/automate/mcp",
  triage: "/reports/triage",
  notifications: "/reports/notifications",
  duplicates: "/reports/duplicates",
  releases: "/reports/releases",
  reporters: "/reports/emails",
  integrations: "/deliver/destinations",
  webhooks: "/deliver/webhooks",
  accounts: "/automate/tokens",
  retention: "/reports/retention",
  "self-hosting": "/self-host/install",
  // The platform reference moved here wholesale when /platform became an
  // overview of the product rather than a specification.
  surfaces: "/how-it-works",
  ingest: "/reference/intake",
  auth: "/automate/tokens",
  signatures: "/deliver/signatures",
  delivery: "/deliver/outbox",
  egress: "/reference/egress",
  limits: "/reference/limits",
  errors: "/reference/errors",
  ids: "/reference/ids",
  attachments: "/reference/attachments",
  catalogue: "/reference/catalogue",
  environment: "/reference/environment",
};
