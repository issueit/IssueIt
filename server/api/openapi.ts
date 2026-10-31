import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config";
import { scopeFor } from "../auth/tokens";
import { featureForPath } from "../billing/entitlements";
import { cheapestWith } from "../billing/plans";
import { scopes } from "../db/schema";

/**
 * An OpenAPI description of the management API, built from the router itself
 * rather than written out beside it: every route Hono knows about appears,
 * and the scope each one costs is read from the same table that enforces it.
 * A route added without a line here fails the contract test rather than
 * quietly going undocumented.
 */

type Doc = {
  summary: string;
  description?: string;
  /** Query parameters, as a zod object. */
  query?: z.ZodObject<z.ZodRawShape>;
  /** Request body, as a zod object. */
  body?: z.ZodObject<z.ZodRawShape>;
  tag: string;
};

const str = () => z.string();

/* Shapes small enough to be worth stating exactly. Bigger bodies are
   described in prose and left open, rather than copied and left to rot. */
const reportFilters = z.object({
  project: str().optional(),
  status: z.enum(["new", "investigating", "resolved", "closed", "open", "all"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  q: str().optional(),
  number: z.number().int().optional(),
  since: str().optional(),
  delivery: z.enum(["failed"]).optional(),
  cursor: str().optional(),
  limit: z.number().int().optional(),
});

const deliveryFilters = z.object({
  project: str().optional(),
  destination: str().optional(),
  provider: str().optional(),
  status: z.enum(["pending", "delivering", "delivered", "retrying", "failed"]).optional(),
  q: str().optional(),
  tests: z.enum(["include", "exclude", "only"]).optional(),
  limit: z.number().int().optional(),
});

const docs: Record<string, Doc> = {
  "GET /whoami": { tag: "Account", summary: "Who this token belongs to", description: "The organisation, role, scopes and visible projects. The first call any client should make." },
  "GET /": { tag: "Organisation", summary: "Read the organisation" },
  "PATCH /": { tag: "Organisation", summary: "Change the organisation's name or settings" },
  "DELETE /": { tag: "Organisation", summary: "Delete the organisation and everything in it" },
  "GET /preferences": { tag: "Organisation", summary: "Read your dashboard layout" },
  "PUT /preferences": { tag: "Organisation", summary: "Save your dashboard layout" },
  "GET /members": { tag: "Organisation", summary: "List members and pending invitations" },
  "PATCH /members/:userId": { tag: "Organisation", summary: "Change someone's role" },
  "DELETE /members/:userId": { tag: "Organisation", summary: "Remove someone, or leave" },
  "POST /invitations": { tag: "Organisation", summary: "Invite someone", body: z.object({ email: str(), role: z.enum(["owner", "member"]).optional() }) },
  "DELETE /invitations/:id": { tag: "Organisation", summary: "Withdraw an invitation" },

  "GET /tokens": { tag: "Tokens", summary: "List account tokens" },
  "GET /tokens/scopes": { tag: "Tokens", summary: "What a token may be granted" },
  "POST /tokens": {
    tag: "Tokens",
    summary: "Create an account token",
    description: "The secret is returned once and never again. Only a signed-in person may do this, never another token.",
    body: z.object({ name: str(), scopes: z.array(z.enum(scopes)), projects: z.array(str()).optional(), expiresInDays: z.number().int().optional() }),
  },
  "POST /tokens/:id/rotate": { tag: "Tokens", summary: "Replace a token's secret, keeping its scopes" },
  "DELETE /tokens/:id": { tag: "Tokens", summary: "Revoke a token" },
  "GET /audit": { tag: "Tokens", summary: "Who changed what", query: z.object({ action: str().optional(), actor: str().optional(), before: str().optional(), limit: z.number().int().optional() }) },

  "GET /projects": { tag: "Projects", summary: "List projects with their counts" },
  "POST /projects": { tag: "Projects", summary: "Create a project", body: z.object({ name: str(), description: str().nullable().optional() }) },
  "GET /projects/:project": { tag: "Projects", summary: "One project, its widget settings and intake addresses" },
  "PATCH /projects/:project": { tag: "Projects", summary: "Change a project", description: "Send only what changes: name, description, allowedOrigins, publicSubmissions, groupDuplicates, widget, emails." },
  "DELETE /projects/:project": { tag: "Projects", summary: "Delete a project and its reports" },
  "POST /projects/:project/logo": { tag: "Projects", summary: "Upload the widget's logo" },
  "DELETE /projects/:project/logo": { tag: "Projects", summary: "Remove the widget's logo" },
  "POST /projects/:project/emails/test": { tag: "Projects", summary: "Send yourself a test reporter email" },

  "GET /projects/:project/keys": { tag: "Keys", summary: "List a project's ingest keys" },
  "POST /projects/:project/keys": { tag: "Keys", summary: "Create an ingest key", body: z.object({ name: str() }) },
  "POST /projects/:project/keys/:id/reveal": { tag: "Keys", summary: "Show an ingest key again" },
  "POST /projects/:project/keys/:id/rotate": { tag: "Keys", summary: "Replace an ingest key's secret" },
  "DELETE /projects/:project/keys/:id": { tag: "Keys", summary: "Revoke an ingest key" },

  "GET /projects/:project/releases": { tag: "Releases", summary: "List a project's builds and how many maps each has" },
  "POST /projects/:project/releases": {
    tag: "Releases",
    summary: "Create or update a build",
    description: "Idempotent on version and dist, so a deploy that runs twice doesn't make two.",
    body: z.object({ version: str(), dist: str().nullable().optional(), commit: str().nullable().optional(), url: str().nullable().optional() }),
  },
  "DELETE /projects/:project/releases/:id": { tag: "Releases", summary: "Delete a build and its source maps" },
  "GET /projects/:project/releases/:id/sourcemaps": { tag: "Releases", summary: "List the source maps uploaded for a build" },
  "PUT /projects/:project/releases/:id/sourcemaps": {
    tag: "Releases",
    summary: "Upload one source map",
    description: "The raw .map file as the body, with ?file= naming the built file it belongs to. Uploading the same file again replaces it.",
    query: z.object({ file: str() }),
  },

  "GET /projects/:project/config": {
    tag: "Projects",
    summary: "The project as a document",
    description: "Everything that decides how the project behaves, with no ids in it, so it can be kept in a repository and applied elsewhere. Webhook URLs need ?secrets=1.",
    query: z.object({ secrets: z.enum(["1"]).optional() }),
  },
  "POST /projects/:project/config": {
    tag: "Projects",
    summary: "Apply a project document",
    description: "dryRun says what would change without changing it; prune removes destinations the document doesn't mention.",
    body: z.object({ config: z.object({ version: z.number().int() }).loose(), dryRun: z.boolean().optional(), prune: z.boolean().optional() }),
  },
  "POST /projects/:project/rules/preview": {
    tag: "Projects",
    summary: "Try grouping and redaction rules against real reports",
    description: "Changes nothing. Shows how recent reports would group, and what the redaction patterns would remove.",
    body: z.object({ grouping: z.object({}).loose().optional(), redaction: z.object({}).loose().optional(), text: str().optional(), sample: z.number().int().optional() }),
  },

  "GET /reports": { tag: "Reports", summary: "Search reports", description: "Newest first. Duplicates are folded into the report they joined.", query: reportFilters },
  "POST /reports/:id/notes": { tag: "Reports", summary: "Leave an internal note", description: "Never delivered anywhere and never shown to the reporter.", body: z.object({ body: str() }) },
  "PATCH /reports/:id/notes/:noteId": { tag: "Reports", summary: "Edit your own note", body: z.object({ body: str() }) },
  "DELETE /reports/:id/notes/:noteId": { tag: "Reports", summary: "Delete a note" },
  "GET /reports/:id": { tag: "Reports", summary: "One report with its diagnostics, attachments and deliveries" },
  "PATCH /reports/:id": { tag: "Reports", summary: "Change a report's status or priority", body: z.object({ status: z.enum(["new", "investigating", "resolved", "closed"]).optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional() }) },
  "POST /reports/:id/group": { tag: "Reports", summary: "Mark a report a duplicate of another", body: z.object({ into: z.number().int() }) },
  "POST /reports/:id/separate": { tag: "Reports", summary: "Take a report out of its group" },
  "DELETE /reports/:id": { tag: "Reports", summary: "Delete a report and its files" },
  "GET /attachments/:id": { tag: "Reports", summary: "Download an attachment" },

  "GET /connections/providers": { tag: "Integrations", summary: "Every service reports can be delivered to" },
  "GET /connections": { tag: "Integrations", summary: "List connected accounts" },
  "POST /connections": { tag: "Integrations", summary: "Connect an account with a token" },
  "POST /connections/authorize/:provider": { tag: "Integrations", summary: "Begin signing in to a service" },
  "POST /connections/:id/validate": { tag: "Integrations", summary: "Check a connection still works" },
  "GET /connections/:id/targets": { tag: "Integrations", summary: "What a connection can deliver to" },
  "DELETE /connections/:id": { tag: "Integrations", summary: "Disconnect an account" },

  "GET /destinations": { tag: "Destinations", summary: "Every destination in the organisation" },
  "GET /projects/:project/destinations": { tag: "Destinations", summary: "Where a project's reports go" },
  "POST /projects/:project/destinations": { tag: "Destinations", summary: "Add a destination", description: "A webhook needs a url; anything else needs a connectionId and a target." },
  "PATCH /projects/:project/destinations/:id": { tag: "Destinations", summary: "Change or pause a destination" },
  "DELETE /projects/:project/destinations/:id": { tag: "Destinations", summary: "Remove a destination" },
  "POST /projects/:project/destinations/:id/reveal": { tag: "Destinations", summary: "Show a webhook's URL and signing secret" },
  "POST /projects/:project/destinations/:id/rotate": { tag: "Destinations", summary: "Replace a webhook's signing secret" },
  "POST /projects/:project/destinations/:id/test": { tag: "Destinations", summary: "Send a test report through a destination" },

  "GET /deliveries": { tag: "Delivery", summary: "The delivery log", query: deliveryFilters },
  "GET /deliveries/:id": { tag: "Delivery", summary: "One delivery with its attempts and the body sent" },
  "POST /deliveries/:id/retry": { tag: "Delivery", summary: "Try one delivery again" },
  "POST /deliveries/retry-failed": { tag: "Delivery", summary: "Try every failed delivery again", body: z.object({ project: str().optional(), destination: str().optional(), provider: str().optional() }) },
  "GET /delivery-policy": { tag: "Delivery", summary: "The built-in delivery policy and this organisation's defaults" },

  "GET /analytics": { tag: "Insight", summary: "Counts, trends and delivery health", query: z.object({ range: z.enum(["24h", "7d", "30d", "90d", "12m"]).optional(), project: str().optional(), tz: str().optional() }) },
  "GET /health": {
    tag: "Insight",
    summary: "Whether delivery is keeping up",
    description: 'Queue depth, the age of the oldest waiting delivery, paused destinations and the day\'s failure rate, with a status of "ok", "degraded" or "behind" to alert on.',
  },
  "GET /usage": { tag: "Insight", summary: "Reports, storage and deliveries against the plan's limits" },
  "GET /billing": { tag: "Billing", summary: "The plan, its limits, and what else there is", description: "On a self-hosted install `billable` is false and the limits are the operator's own." },
  "POST /billing/checkout": { tag: "Billing", summary: "Start a Stripe Checkout session", body: z.object({ plan: z.enum(["solo", "team", "business"]), interval: z.enum(["month", "year"]).optional() }) },
  "POST /billing/portal": { tag: "Billing", summary: "Open the Stripe customer portal" },
  "GET /billing/invoices": { tag: "Billing", summary: "Past invoices" },
  "GET /notifications": { tag: "Account", summary: "What Issueit emails you about this organisation" },
  "PATCH /notifications": {
    tag: "Account",
    summary: "Change what you're emailed about",
    body: z.object({
      reports: z.enum(["off", "critical", "high", "all"]).optional(),
      pipeline: z.boolean().optional(),
      digest: z.enum(["off", "daily", "weekly"]).optional(),
      mutedProjects: z.array(str()).optional(),
    }),
  },
  "POST /notifications/test": { tag: "Account", summary: "Send yourself a digest now" },
  "GET /onboarding": { tag: "Organisation", summary: "How far setting up has got", description: "Worked out from what exists, so it is never stale." },
  "POST /onboarding/test-report": { tag: "Organisation", summary: "File a sample report to prove the pipeline works", body: z.object({ project: str() }) },
  "GET /events": { tag: "Insight", summary: "Live events as server-sent events", description: "A stream that emits whenever a report arrives or a delivery changes, so a client needn't poll." },
};

/** The part of a Hono route below /api/orgs/:org. */
const subPath = (path: string) => path.replace(/^\/api\/orgs\/:org/, "") || "/";

/** Every scoped route the router actually serves, as "METHOD /subpath". */
export function scopedRoutes(app: Hono): string[] {
  const seen = new Set<string>();
  for (const r of app.routes) {
    if (!r.path.startsWith("/api/orgs/:org") || r.method === "ALL") continue;
    seen.add(`${r.method} ${subPath(r.path)}`);
  }
  return [...seen].sort();
}

export function buildSpec(app: Hono) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const key of scopedRoutes(app)) {
    const [method, path] = key.split(" ") as [string, string];
    const doc = docs[key];
    if (!doc) continue;
    const scope = scopeFor(method, path);
    const feature = featureForPath(path);
    const url = `/api/orgs/{org}${path === "/" ? "" : path}`.replace(/:(\w+)/g, "{$1}");
    const parameters = [
      { name: "org", in: "path", required: true, schema: { type: "string" }, description: 'The organisation id, or "current" for the one the token belongs to.' },
      ...[...path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } })),
      ...(doc.query ? queryParameters(doc.query) : []),
    ];

    paths[url] ??= {};
    paths[url][method.toLowerCase()] = {
      tags: [doc.tag],
      summary: doc.summary,
      ...(doc.description ? { description: doc.description } : {}),
      operationId: operationId(method, path),
      parameters,
      ...(doc.body ? { requestBody: { required: true, content: { "application/json": { schema: json(doc.body) } } } } : {}),
      responses: {
        "200": { description: "Done." },
        "401": { description: "No credentials, or they are no longer valid.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "403": { description: "Not allowed, or the token is missing a scope.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        ...(feature
          ? { "402": { description: `Included from the ${cheapestWith(feature)?.name ?? "paid"} plan upwards.`, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } }
          : {}),
      },
      security: scope === "session" ? [{ session: [] }] : [{ token: scope ? [scope] : [] }, { session: [] }],
      "x-issueit-scope": scope === "session" ? null : scope,
      "x-issueit-session-only": scope === "session" || undefined,
      /** The plan feature this endpoint belongs to, read from the same table that enforces it. */
      "x-issueit-plan-feature": feature ?? undefined,
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Issueit management API",
      version: "1",
      summary: "Everything the dashboard does, for the MCP server, the command line and CI.",
      description:
        "Authenticate with an account token (`ak_live_…`) as a bearer header. The organisation in the path may be written `current` to mean the one the token belongs to. Sending reports is a different API, documented separately, and uses a project's own secret key.",
    },
    servers: [{ url: config.appUrl }],
    tags: [...new Set(Object.values(docs).map((d) => d.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        token: { type: "http", scheme: "bearer", bearerFormat: "ak_live_…", description: "An account token. Its scopes decide what it may reach." },
        session: { type: "apiKey", in: "cookie", name: "issueit_session", description: "A dashboard session. Some endpoints accept nothing else." },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: { type: "object" } }, required: ["code", "message"] } },
          required: ["error"],
        },
      },
    },
    security: [{ token: [] }],
  };
}

function json(schema: z.ZodType) {
  // OpenAPI carries its own dialect, so the generated $schema is noise here.
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
}

function queryParameters(schema: z.ZodObject<z.ZodRawShape>) {
  const shape = json(schema) as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(shape.properties ?? {}).map(([name, s]) => ({ name, in: "query", required: shape.required?.includes(name) ?? false, schema: s }));
}

/** "listReports", "getReport", "updateDestination": names a generated client can live with. */
function operationId(method: string, path: string) {
  const segments = path.split("/").filter(Boolean);
  const nouns = segments.filter((p) => !p.startsWith(":"));
  // A path ending in an id acts on one of the things; so does creating one.
  const one = segments[segments.length - 1]?.startsWith(":") ?? false;
  if ((one || method === "POST") && nouns.length) nouns[nouns.length - 1] = singular(nouns[nouns.length - 1]);
  const last = segments[segments.length - 1] ?? "";
  const verb = method === "GET" ? (!one && collections.test(last) ? "list" : "get") : ({ POST: "create", PATCH: "update", PUT: "set", DELETE: "delete" }[method] ?? method.toLowerCase());
  const name = nouns.map(camel).map((p, i) => (i === 0 ? p : upper(p))).join("");
  return `${verb}${name ? upper(name) : "Organisation"}`;
}

/** Paths that name a set of things, so reading them is a list rather than a get. */
const collections = /^(projects|reports|tokens|connections|destinations|deliveries|members|invitations|keys|providers|targets)$/;

const singular = (word: string) => word.replace(/ies$/, "y").replace(/sses$/, "ss").replace(/([^s])s$/, "$1");
const camel = (word: string) => word.replace(/-./g, (m) => m[1].toUpperCase());
const upper = (word: string) => word[0].toUpperCase() + word.slice(1);

export const openapiRoutes = (app: Hono) =>
  new Hono().get("/", (c) => {
    c.header("cache-control", "public, max-age=300");
    return c.json(buildSpec(app));
  });
