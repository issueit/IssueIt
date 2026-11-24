import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono, type Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { eq } from "drizzle-orm";
import { config } from "./config";
import { db, schema } from "./db";
import { AppError, notFound } from "./lib/errors";
import type { AppEnv } from "./http";
import { authRoutes, meRoutes } from "./auth/routes";
import { deviceApprovalRoutes, deviceRoutes } from "./auth/device";
import { auditTrail, enforceScope, requireAuth, resolveOrg } from "./auth/tokens";
import { enforceFeatures, hosted } from "./billing/entitlements";
import { money, planList } from "./billing/plans";
import { invitationRoutes, orgRoutes, orgScoped } from "./api/organisations";
import { projectRoutes } from "./api/projects";
import { attachmentRoutes, reportRoutes, streamAttachment } from "./api/reports";
import { connectionRoutes, deliveryRoutes, destinationRoutes, orgDestinationRoutes, policyRoutes } from "./api/integrations";
import { analyticsRoutes } from "./api/analytics";
import { eventRoutes, usageRoutes } from "./api/usage";
import { auditRoutes, tokenRoutes, whoamiRoutes } from "./api/tokens";
import { billingRoutes, billingWebhook } from "./hosted";
import { notificationRoutes } from "./api/notifications";
import { onboardingRoutes } from "./api/onboarding";
import { releaseRoutes } from "./api/releases";
import { configRoutes, rulePreviewRoutes } from "./api/config";
import { healthRoutes, metricsRoutes } from "./api/health";
import { llmRoutes } from "./api/llm";
import { mcpEndpoint } from "./api/mcp";
import { openapiRoutes } from "./api/openapi";
import { oauthRoutes } from "./integrations/oauth";
import { providers } from "./integrations";
import { ingestRoutes } from "./ingest/routes";
import { hostedFormPage, stopEmailsPage } from "./ingest/form";
import { stopEmails, verifyStop } from "./mail/outbox";
import { verifyAttachmentSignature } from "./delivery/payload";
import { redirectFor } from "../shared/hosts";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Where the build put its output: next to the server bundle, or under the repo in development. */
const distRoots = [path.resolve(here, ".."), path.resolve(here, "../dist"), path.resolve("dist")];
/**
 * Each part of the build is looked for by something only it has, because
 * they are built by separate commands and any one of them can be missing —
 * a server running from source has none of them, and the test run has the
 * documentation but no dashboard.
 */
const built = (dir: string, marker: string) => distRoots.map((root) => path.join(root, dir)).find((p) => fs.existsSync(path.join(p, marker))) ?? null;

const webRoot = built("web", "index.html");
const cdnRoot = built("cdn", "widget.js");
/** The documentation written out as Markdown, for readers that aren't browsers. Found on first use; see llmRoutes. */
const llmRoots = distRoots.map((root) => path.join(root, "llm"));
/**
 * The page says where the dashboard and the marketing site live, so links
 * between them can leave for the right host without asking the server.
 * Read synchronously by web/src/lib/hosts.ts before the router starts.
 */
const hostsMeta = `<meta name="issueit-hosts" content="${JSON.stringify({ app: config.appUrl, marketing: config.marketingUrl }).replace(/"/g, "&quot;")}">`;
const indexHtml = webRoot ? fs.readFileSync(path.join(webRoot, "index.html"), "utf8").replace("</head>", `${hostsMeta}</head>`) : null;

const DASHBOARD_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

export function createApp() {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "strict-origin-when-cross-origin");
    if (!c.req.path.startsWith("/v1/") && !c.req.path.startsWith("/widget")) c.header("x-frame-options", "DENY");
  });

  app.onError((err, c) => {
    const isIngest = c.req.path.startsWith("/v1/");
    if (err instanceof AppError) {
      const error = { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) };
      return c.json(isIngest ? { success: false, error } : { error }, err.status);
    }
    // A webhook address carries its secret key in the path; it doesn't belong in a log.
    console.error("[http]", c.req.method, c.req.path.replace(/\/webhook\/[^/]+/, "/webhook/[key]"), err);
    const error = { code: "server_error", message: "Something went wrong on our side. Try again in a moment." };
    return c.json(isIngest ? { success: false, error } : { error }, 500);
  });

  app.get("/health", async (c) => {
    await db.execute("select 1");
    return c.json({ ok: true });
  });

  /** Prometheus metrics for the whole install, off unless METRICS_TOKEN is set. */
  app.route("/metrics", metricsRoutes);

  /* ---------------------------------------------------------- ingestion (drop.) */
  app.route("/v1", ingestRoutes);

  /* ---------------------------------------------------------- dashboard API (dash.) */
  /**
   * The management API. A dashboard session or an account token may call it;
   * `enforceScope` decides what a token is allowed to reach, and `auditTrail`
   * records whatever changed.
   */
  const scoped = new Hono<AppEnv>()
    .use("*", requireAuth, resolveOrg, enforceScope, enforceFeatures, auditTrail)
    .route("/", orgScoped)
    .route("/projects", projectRoutes)
    .route("/projects/:project/destinations", destinationRoutes)
    .route("/projects/:project/releases", releaseRoutes)
    .route("/projects/:project/config", configRoutes)
    .route("/projects/:project/rules", rulePreviewRoutes)
    .route("/reports", reportRoutes)
    .route("/attachments", attachmentRoutes)
    .route("/connections", connectionRoutes)
    .route("/deliveries", deliveryRoutes)
    .route("/destinations", orgDestinationRoutes)
    .route("/delivery-policy", policyRoutes)
    .route("/analytics", analyticsRoutes)
    .route("/health", healthRoutes)
    .route("/billing", billingRoutes)
    .route("/notifications", notificationRoutes)
    .route("/onboarding", onboardingRoutes)
    .route("/tokens", tokenRoutes)
    .route("/whoami", whoamiRoutes)
    .route("/audit", auditRoutes)
    .route("/usage", usageRoutes)
    .route("/events", eventRoutes);

  /**
   * Stripe's webhook. Outside the authenticated API on purpose: its
   * signature is its authentication, and it must see the raw body.
   */
  app.route("/api/billing/webhook", billingWebhook);

  app.route("/api/auth/device", deviceRoutes);
  app.route("/api/auth", authRoutes);
  app.route("/api/me/device", deviceApprovalRoutes);
  app.route("/api/me", meRoutes);
  app.route("/api/invitations", invitationRoutes);
  app.route("/api/oauth", oauthRoutes);
  app.route("/api/orgs/:org", scoped);
  app.route("/api/orgs", orgRoutes);
  /**
   * The plans, public so the pricing page states what is actually sold
   * rather than a copy of it that drifts. Always listed, because the
   * marketing pages describe the hosted service wherever they are served
   * from; `edition` says whether this install is the one selling them.
   */
  app.get("/api/plans", (c) => {
    c.header("cache-control", "public, max-age=300");
    return c.json({
      edition: config.edition,
      trialDays: config.trialDays,
      /** True when this install can actually take the money. */
      billable: hosted,
      plans: planList.map((p) => ({
        id: p.id,
        name: p.name,
        blurb: p.blurb,
        who: p.who,
        monthly: p.monthly,
        yearly: p.yearly,
        monthlyLabel: p.monthly ? money(p.monthly) : "Free",
        yearlyLabel: p.yearly ? money(p.yearly) : "Free",
        limits: p.limits,
        features: p.features,
      })),
    });
  });
  /**
   * Where this install serves each thing. The documentation shows endpoints
   * in code samples a reader is meant to copy, and it is served from the
   * same build whether that's one origin or five, so it asks rather than
   * assuming the address bar is the intake host.
   */
  app.get("/api/urls", (c) => {
    c.header("cache-control", "public, max-age=300");
    return c.json({ app: config.appUrl, drop: config.dropUrl, cdn: config.cdnUrl, docs: config.docsUrl, marketing: config.marketingUrl, edition: config.edition });
  });
  /** The integration catalogue, public so the docs and the marketing site list what's live. */
  app.get("/api/catalogue", (c) => {
    c.header("cache-control", "public, max-age=300");
    return c.json({ providers: providers.map((p) => ({ id: p.id, name: p.name, category: p.category, summary: p.summary })) });
  });
  /** The management API, described from the router itself. */
  app.route("/openapi.json", openapiRoutes(app));

  app.all("/api/*", () => {
    throw notFound("That endpoint");
  });

  /**
   * The Model Context Protocol endpoint, for agents that speak it over HTTP.
   * It dispatches into this same app, so a token reaches no further here than
   * it would through the API.
   */
  app.route("/mcp", mcpEndpoint(async (req) => app.fetch(req)));

  /**
   * llms.txt, the whole documentation as Markdown, and the JSON manifest of
   * both. Before the dashboard's routes, so `/collect/widget.md` is a file
   * rather than the single-page app's idea of a missing page.
   */
  app.route("/", llmRoutes(llmRoots));

  /* ---------------------------------------------------------- public pages and files */
  app.get("/r/:project", async (c) => {
    const { status, html } = await hostedFormPage(c.req.param("project"));
    c.header(
      "content-security-policy",
      `default-src 'self'; script-src 'self' ${config.cdnUrl}; connect-src 'self' ${config.dropUrl}; img-src 'self' ${config.dropUrl} ${config.cdnUrl} data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`,
    );
    return c.html(html, status as 200 | 404);
  });

  /**
   * "Stop emails about this report", from the link in every reporter email.
   * The link shows a button rather than acting, so mail scanners that open
   * links don't unsubscribe people; mail clients' one-click POST acts.
   */
  const stopCsp = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'";
  app.get("/e/:id/stop", (c) => {
    const id = c.req.param("id");
    c.header("content-security-policy", stopCsp);
    if (!verifyStop(id, c.req.query("sig"))) return c.html(stopEmailsPage("invalid"), 403);
    return c.html(stopEmailsPage("ask", `/e/${encodeURIComponent(id)}/stop?sig=${encodeURIComponent(c.req.query("sig")!)}`));
  });
  app.post("/e/:id/stop", async (c) => {
    const id = c.req.param("id");
    c.header("content-security-policy", stopCsp);
    if (!verifyStop(id, c.req.query("sig"))) return c.html(stopEmailsPage("invalid"), 403);
    await stopEmails(id);
    return c.html(stopEmailsPage("done"));
  });

  /** Signed attachment links used in external tools. */
  app.get("/a/:id/:name?", async (c) => {
    const id = c.req.param("id");
    if (!verifyAttachmentSignature(id, c.req.query("exp"), c.req.query("sig"))) throw new AppError(403, "link_expired", "This attachment link has expired.");
    const a = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, id) });
    if (!a) throw notFound("That attachment");
    return streamAttachment(a);
  });

  if (cdnRoot) {
    app.get("/widget.js", async (c) => {
      const file = path.join(cdnRoot, "widget.js");
      if (!fs.existsSync(file)) throw notFound("The widget");
      c.header("content-type", "text/javascript; charset=utf-8");
      c.header("cache-control", "public, max-age=300");
      c.header("access-control-allow-origin", "*");
      c.header("cross-origin-resource-policy", "cross-origin");
      return c.body(fs.readFileSync(file));
    });
  }

  /* ---------------------------------------------------------- dashboard SPA */
  if (webRoot && indexHtml) {
    const root = path.relative(process.cwd(), webRoot) || ".";
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.status === 200) c.header("cache-control", "public, max-age=31536000, immutable");
    });
    const hosts = { app: config.appUrl, marketing: config.marketingUrl };
    const spa = (c: Context) => {
      /**
       * The marketing site and the dashboard have a host each when they are
       * configured apart: issueit.app answers only marketing pages, and
       * dash.issueit.app only the dashboard. A page asked for on the wrong
       * one is sent to the right one, query and all.
       */
      const host = (config.trustProxy && c.req.header("x-forwarded-host")) || c.req.header("host") || "";
      const url = new URL(c.req.url);
      const elsewhere = redirectFor(hosts, host.split(",")[0].trim(), url.pathname, url.search);
      if (elsewhere) return c.redirect(elsewhere, url.pathname === "/" ? 302 : 301);
      c.header("content-security-policy", DASHBOARD_CSP);
      c.header("cache-control", "no-cache");
      return c.html(indexHtml);
    };
    app.get("/", spa);
    app.use("/*", serveStatic({ root }));
    app.get("/assets/*", () => {
      throw notFound("That file");
    });
    app.get("*", spa);
  } else {
    app.get("/", (c) => c.text("Issueit API is running. Build the dashboard with npm run build."));
  }

  return app;
}
