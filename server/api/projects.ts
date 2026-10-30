import { Hono, type Context } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { config } from "../config";
import { db, schema } from "../db";
import { defaultWidgetConfig, emailsWithDefaults, priorities, widgetWithDefaults } from "../db/schema";
import { decrypt, encrypt, randomToken, sha256 } from "../lib/crypto";
import { AppError, badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { storage } from "../lib/storage";
import { body, type AppEnv } from "../http";
import { getProvider } from "../integrations";
import { IntegrationError } from "../integrations/http";
import { sniff } from "../ingest/files";
import { issueitMailAvailable, sendTestEmail } from "../mail/outbox";

/** Loads a project and checks it belongs to the organisation in the path. Never trust the id alone. */
export async function loadProject(c: Context<AppEnv>, id = c.req.param("project")) {
  if (!id) throw notFound("That project");
  const project = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, id), eq(schema.projects.orgId, c.get("orgId"))) });
  if (!project) throw notFound("That project");
  return project;
}

const origin = z
  .string()
  .trim()
  .transform((v, ctx) => {
    try {
      const url = new URL(v.includes("://") ? v : `https://${v}`);
      if (!/^https?:$/.test(url.protocol)) throw new Error();
      return url.origin;
    } catch {
      ctx.addIssue({ code: "custom", message: `"${v}" isn't a valid site address.` });
      return z.NEVER;
    }
  });

const words = (max: number) => z.string().trim().max(max);
const fieldMode = z.enum(["off", "optional", "required"]);
const pagePattern = z.string().trim().min(1).max(200);

const widgetField = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, "Field keys use letters, numbers, dashes and underscores."),
  label: z.string().trim().min(1, "Give every field a label.").max(80),
  type: z.enum(["text", "textarea", "select", "checkbox", "email", "url", "number"]),
  required: z.boolean(),
  placeholder: words(120).optional(),
  help: words(200).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
});

const widgetSchema = z.object({
  showButton: z.boolean(),
  buttonLabel: z.string().trim().min(1).max(40),
  buttonIcon: z.enum(["bug", "chat", "flag", "help", "logo", "none"]),
  buttonStyle: z.enum(["pill", "square", "icon"]),
  buttonSize: z.enum(["sm", "md", "lg"]),
  position: z.enum(["bottom-right", "bottom-left", "top-right", "top-left", "middle-right", "middle-left"]),
  offsetX: z.number().int().min(0).max(200),
  offsetY: z.number().int().min(0).max(200),
  theme: z.enum(["auto", "light", "dark"]),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3f6fb5.")
    .nullable(),
  radius: z.number().int().min(0).max(24),
  panelWidth: z.number().int().min(300).max(560),
  font: z.enum(["system", "inherit"]),
  shadow: z.enum(["none", "soft", "strong"]),
  backdrop: z.boolean(),
  logo: z
    .string()
    .regex(/^\/v1\/prj_[a-z0-9]+\/logo\?v=[a-f0-9]+$/, "Upload the logo here rather than linking to one.")
    .nullable(),
  brandName: words(60),
  headerStyle: z.enum(["plain", "filled"]),
  poweredBy: z.boolean(),
  title: z.string().trim().min(1).max(60),
  intro: words(300),
  titleLabel: z.string().trim().min(1).max(60),
  titlePlaceholder: words(80),
  descriptionLabel: z.string().trim().min(1).max(60),
  descriptionPlaceholder: words(160),
  submitLabel: z.string().trim().min(1).max(30),
  successTitle: z.string().trim().min(1).max(60),
  successMessage: words(300),
  footerNote: words(200),
  privacyUrl: z.string().trim().url("Use a full URL.").max(500).nullable(),
  updatesLabel: z.string().trim().min(1).max(80),
  duplicateMessage: words(200),
  collectEmail: fieldMode,
  collectName: fieldMode,
  descriptionRequired: z.boolean(),
  askPriority: z.boolean(),
  defaultPriority: z.enum(priorities),
  categories: z.array(z.string().trim().min(1).max(40)).max(20),
  categoryLabel: z.string().trim().min(1).max(40),
  customFields: z
    .array(widgetField)
    .max(12)
    .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, "Each field needs its own key."),
  allowAttachments: z.boolean(),
  allowScreenshot: z.boolean(),
  maxFiles: z.number().int().min(1).max(config.limits.attachmentsPerReport),
  shortcut: z
    .string()
    .trim()
    .max(40)
    .regex(/^((mod|ctrl|alt|shift|meta)\+)*[a-z0-9]$/i, "Use a shortcut like mod+shift+b.")
    .nullable(),
  autoCloseSeconds: z.number().int().min(0).max(60),
  hideOnMobile: z.boolean(),
  includePages: z.array(pagePattern).max(30),
  excludePages: z.array(pagePattern).max(30),
  sendContext: z.boolean(),
  captureConsole: z.boolean(),
  captureNetwork: z.boolean(),
  captureSteps: z.boolean(),
  environment: z.string().trim().max(40).nullable(),
});

const emailSettingsSchema = z
  .object({
    enabled: z.boolean(),
    receipt: z.boolean(),
    resolved: z.boolean(),
    sender: z.enum(["issueit", "connection"]),
    connectionId: z.string().max(40).nullable(),
    fromName: words(60),
    replyTo: z.string().trim().toLowerCase().email("Enter a valid reply-to address.").max(254).nullable().or(z.literal("").transform(() => null)),
    receiptMessage: words(600),
    resolvedMessage: words(600),
  })
  .partial();

const LOGO_BYTES = 512 * 1024;

const projectInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  description: z.string().trim().max(280).nullable().optional(),
});

/** Endpoints and snippets the dashboard shows for a project. */
export function projectLinks(id: string) {
  return {
    endpoint: `${config.dropUrl}/v1/${id}/reports`,
    formUrl: `${config.appUrl}/r/${id}`,
    widgetUrl: `${config.cdnUrl}/widget.js`,
    docsUrl: config.docsUrl,
  };
}

const keyPrefix = (key: string) => key.slice(0, 12);

function newSecretKey() {
  return `sk_live_${randomToken(24).replace(/[-_]/g, "").slice(0, 32)}`;
}

export const projectRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const orgId = c.get("orgId");
    const rows = await db.execute<{
      id: string;
      name: string;
      description: string | null;
      created_at: Date;
      last_report_at: Date | null;
      report_count: number;
      new_count: number;
      destination_count: number;
      failing_count: number;
    }>(sql`
      select p.id, p.name, p.description, p.created_at, p.last_report_at,
        (select count(*)::int from reports r where r.project_id = p.id) as report_count,
        (select count(*)::int from reports r where r.project_id = p.id and r.status = 'new' and r.group_id is null) as new_count,
        (select count(*)::int from destinations d where d.project_id = p.id and d.enabled) as destination_count,
        (select count(*)::int from destinations d
           left join connections cn on cn.id = d.connection_id
           where d.project_id = p.id and d.enabled and (cn.status = 'error' or exists (
             select 1 from deliveries dl where dl.destination_id = d.id and dl.status = 'failed' and not dl.is_test
               and dl.created_at > now() - interval '7 days'
               and not exists (select 1 from deliveries ok where ok.destination_id = d.id and ok.status = 'delivered' and ok.created_at > dl.created_at)))
        ) as failing_count
      from projects p where p.org_id = ${orgId} order by p.created_at`);
    return c.json({
      projects: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        createdAt: r.created_at,
        lastReportAt: r.last_report_at,
        reportCount: r.report_count,
        newCount: r.new_count,
        destinationCount: r.destination_count,
        failingCount: r.failing_count,
      })),
    });
  })
  .post("/", async (c) => {
    const input = await body(c, projectInput);
    const id = newId("prj", 12);
    const [project] = await db
      .insert(schema.projects)
      .values({ id, orgId: c.get("orgId"), name: input.name, description: input.description || null, widget: defaultWidgetConfig })
      .returning();
    return c.json({ project }, 201);
  })
  .get("/:project", async (c) => {
    const project = await loadProject(c);
    const [stats] = await db.execute<{ total: number; open: number; week: number }>(sql`
      select count(*)::int as total,
        count(*) filter (where status in ('new', 'investigating') and group_id is null)::int as open,
        count(*) filter (where created_at > now() - interval '7 days')::int as week
      from reports where project_id = ${project.id}`);
    return c.json({ project: projectView(project), links: projectLinks(project.id), stats, mail: mailInfo() });
  })
  .patch("/:project", async (c) => {
    const project = await loadProject(c);
    const input = await body(
      c,
      projectInput.partial().extend({
        publicSubmissions: z.boolean().optional(),
        allowedOrigins: z.array(origin).max(50).optional(),
        widget: widgetSchema.partial().optional(),
        /** Replaces the whole widget configuration, e.g. when importing or resetting. */
        replaceWidget: z.boolean().optional(),
        emails: emailSettingsSchema.optional(),
        groupDuplicates: z.boolean().optional(),
      }),
    );
    let emails = project.emails;
    if (input.emails) {
      emails = { ...emailsWithDefaults(project.emails), ...input.emails };
      if (emails.sender === "connection" && emails.connectionId) {
        const conn = await db.query.connections.findFirst({ where: and(eq(schema.connections.id, emails.connectionId), eq(schema.connections.orgId, project.orgId)) });
        if (!conn || getProvider(conn.provider)?.category !== "email") throw badRequest("connectionId: Choose one of your connected email services.");
      }
    }
    const [updated] = await db
      .update(schema.projects)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description || null }),
        ...(input.publicSubmissions !== undefined && { publicSubmissions: input.publicSubmissions }),
        ...(input.allowedOrigins !== undefined && { allowedOrigins: [...new Set(input.allowedOrigins)] }),
        ...(input.widget && { widget: { ...defaultWidgetConfig, ...(input.replaceWidget ? {} : project.widget), ...input.widget } }),
        ...(input.emails && { emails }),
        ...(input.groupDuplicates !== undefined && { groupDuplicates: input.groupDuplicates }),
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, project.id))
      .returning();
    return c.json({ project: projectView(updated) });
  })
  /** Sends a sample reporter email to you, using the saved settings. */
  .post("/:project/emails/test", async (c) => {
    const project = await loadProject(c);
    const input = await body(c, z.object({ kind: z.enum(["receipt", "resolved"]).default("receipt") }));
    const settings = emailsWithDefaults(project.emails);
    try {
      const { via } = await sendTestEmail(project, settings, c.get("user").email, input.kind);
      return c.json({ ok: true, to: c.get("user").email, via });
    } catch (err) {
      if (err instanceof IntegrationError) throw new AppError(422, "email_failed", err.message);
      throw err;
    }
  })
  /**
   * Logos apply straight away: they're files rather than settings, so the
   * saved widget is updated along with the draft.
   */
  .post("/:project/logo", async (c) => {
    const project = await loadProject(c);
    const input = await body(c, z.object({ data: z.string().max(Math.ceil(LOGO_BYTES * 1.4) + 100) }));
    const bytes = new Uint8Array(Buffer.from(input.data.replace(/^data:[^;]+;base64,/, ""), "base64"));
    if (!bytes.byteLength) throw badRequest("That file is empty.");
    if (bytes.byteLength > LOGO_BYTES) throw new AppError(413, "logo_too_large", "Use a logo under 512 KB.");
    const type = sniff(bytes);
    if (!type || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type.contentType)) throw new AppError(415, "unsupported_logo", "Use a PNG, JPEG, WebP or GIF logo.");
    const hash = sha256(Buffer.from(bytes).toString("base64")).slice(0, 16);
    const storageKey = `${project.orgId}/${project.id}/brand/logo-${hash}.${type.ext}`;
    if (project.logo?.storageKey !== storageKey) {
      await storage.put(storageKey, bytes);
      if (project.logo) await storage.remove(project.logo.storageKey).catch(() => {});
    }
    const logo = `/v1/${project.id}/logo?v=${hash}`;
    const [updated] = await db
      .update(schema.projects)
      .set({ logo: { storageKey, contentType: type.contentType, sizeBytes: bytes.byteLength, hash }, widget: { ...widgetWithDefaults(project.widget), logo }, updatedAt: new Date() })
      .where(eq(schema.projects.id, project.id))
      .returning();
    return c.json({ logo, project: projectView(updated) });
  })
  .delete("/:project/logo", async (c) => {
    const project = await loadProject(c);
    if (project.logo) await storage.remove(project.logo.storageKey).catch(() => {});
    const widget = widgetWithDefaults(project.widget);
    const [updated] = await db
      .update(schema.projects)
      .set({ logo: null, widget: { ...widget, logo: null, buttonIcon: widget.buttonIcon === "logo" ? "bug" : widget.buttonIcon }, updatedAt: new Date() })
      .where(eq(schema.projects.id, project.id))
      .returning();
    return c.json({ project: projectView(updated) });
  })
  .delete("/:project", async (c) => {
    const project = await loadProject(c);
    const input = await body(c, z.object({ confirm: z.string() }));
    if (input.confirm.trim() !== project.name) throw badRequest("Type the project's name exactly to confirm.");
    await db.delete(schema.projects).where(eq(schema.projects.id, project.id));
    await storage.removePrefix(`${project.orgId}/${project.id}`).catch(() => {});
    return c.json({ ok: true });
  })

  /* ------------------------------------------------------------ secret keys */
  .get("/:project/keys", async (c) => {
    const project = await loadProject(c);
    const keys = await db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        prefix: schema.apiKeys.prefix,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        createdAt: schema.apiKeys.createdAt,
        createdBy: schema.users.name,
      })
      .from(schema.apiKeys)
      .leftJoin(schema.users, eq(schema.users.id, schema.apiKeys.createdBy))
      .where(and(eq(schema.apiKeys.projectId, project.id), isNull(schema.apiKeys.revokedAt)))
      .orderBy(desc(schema.apiKeys.createdAt));
    return c.json({ keys });
  })
  .post("/:project/keys", async (c) => {
    const project = await loadProject(c);
    const input = await body(c, z.object({ name: z.string().trim().min(1, "Enter a name.").max(60) }));
    const key = newSecretKey();
    const id = newId("key");
    await db.insert(schema.apiKeys).values({
      id,
      projectId: project.id,
      orgId: project.orgId,
      name: input.name,
      prefix: keyPrefix(key),
      keyHash: sha256(key),
      keyEncrypted: encrypt(key),
      createdBy: c.get("user").id,
    });
    return c.json({ id, key }, 201);
  })
  .post("/:project/keys/:id/reveal", async (c) => {
    const project = await loadProject(c);
    const row = await findKey(project.id, c.req.param("id"));
    return c.json({ key: decrypt(row.keyEncrypted) });
  })
  .post("/:project/keys/:id/rotate", async (c) => {
    const project = await loadProject(c);
    const row = await findKey(project.id, c.req.param("id"));
    const key = newSecretKey();
    await db
      .update(schema.apiKeys)
      .set({ prefix: keyPrefix(key), keyHash: sha256(key), keyEncrypted: encrypt(key), lastUsedAt: null })
      .where(eq(schema.apiKeys.id, row.id));
    return c.json({ key });
  })
  .delete("/:project/keys/:id", async (c) => {
    const project = await loadProject(c);
    const row = await findKey(project.id, c.req.param("id"));
    await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
    return c.json({ ok: true });
  });

type ProjectRow = typeof schema.projects.$inferSelect;

/** What the dashboard sees: settings with defaults filled in, and no storage details. */
function projectView({ logo: _logo, reportSeq: _seq, ...p }: ProjectRow) {
  return { ...p, widget: widgetWithDefaults(p.widget), emails: emailsWithDefaults(p.emails) };
}

/** Whether Issueit can send email itself, and as whom. */
const mailInfo = () => ({ issueit: issueitMailAvailable(), from: issueitMailAvailable() ? config.smtp.from : null });

async function findKey(projectId: string, id: string) {
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.projectId, projectId), isNull(schema.apiKeys.revokedAt)),
  });
  if (!row) throw notFound("That key");
  return row;
}
