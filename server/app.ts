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
import { requireOrg, requireUser } from "./auth/session";
import { invitationRoutes, orgRoutes, orgScoped } from "./api/organisations";
import { projectRoutes } from "./api/projects";
import { attachmentRoutes, reportRoutes, streamAttachment } from "./api/reports";
import { connectionRoutes, deliveryRoutes, destinationRoutes, orgDestinationRoutes, policyRoutes } from "./api/integrations";
import { analyticsRoutes } from "./api/analytics";
import { eventRoutes, usageRoutes } from "./api/usage";
import { oauthRoutes } from "./integrations/oauth";
import { providers } from "./integrations";
import { ingestRoutes } from "./ingest/routes";
import { hostedFormPage, stopEmailsPage } from "./ingest/form";
import { stopEmails, verifyStop } from "./mail/outbox";
import { verifyAttachmentSignature } from "./delivery/payload";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Built assets: dist/web (dashboard) and dist/cdn (widget), next to the server bundle or under the repo. */
const distRoot = [path.resolve(here, ".."), path.resolve(here, "../dist"), path.resolve("dist")].find(
  (p) => fs.existsSync(path.join(p, "web", "assets")) && fs.existsSync(path.join(p, "web", "index.html")),
);
const webRoot = distRoot ? path.join(distRoot, "web") : null;
const cdnRoot = distRoot ? path.join(distRoot, "cdn") : null;
const indexHtml = webRoot ? fs.readFileSync(path.join(webRoot, "index.html"), "utf8") : null;

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
    console.error("[http]", c.req.method, c.req.path, err);
    const error = { code: "server_error", message: "Something went wrong on our side. Try again in a moment." };
    return c.json(isIngest ? { success: false, error } : { error }, 500);
  });

  app.get("/health", async (c) => {
    await db.execute("select 1");
    return c.json({ ok: true });
  });

  /* ---------------------------------------------------------- ingestion (drop.) */
  app.route("/v1", ingestRoutes);

  /* ---------------------------------------------------------- dashboard API (dash.) */
  const scoped = new Hono<AppEnv>()
    .use("*", requireUser, requireOrg)
    .route("/", orgScoped)
    .route("/projects", projectRoutes)
    .route("/projects/:project/destinations", destinationRoutes)
    .route("/reports", reportRoutes)
    .route("/attachments", attachmentRoutes)
    .route("/connections", connectionRoutes)
    .route("/deliveries", deliveryRoutes)
    .route("/destinations", orgDestinationRoutes)
    .route("/delivery-policy", policyRoutes)
    .route("/analytics", analyticsRoutes)
    .route("/usage", usageRoutes)
    .route("/events", eventRoutes);

  app.route("/api/auth", authRoutes);
  app.route("/api/me", meRoutes);
  app.route("/api/invitations", invitationRoutes);
  app.route("/api/oauth", oauthRoutes);
  app.route("/api/orgs/:org", scoped);
  app.route("/api/orgs", orgRoutes);
  /** The integration catalogue, public so the docs and the marketing site list what's live. */
  app.get("/api/catalogue", (c) => {
    c.header("cache-control", "public, max-age=300");
    return c.json({ providers: providers.map((p) => ({ id: p.id, name: p.name, category: p.category, summary: p.summary })) });
  });
  app.all("/api/*", () => {
    throw notFound("That endpoint");
  });

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
    const spa = (c: Context) => {
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
