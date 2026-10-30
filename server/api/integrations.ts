import { Hono } from "hono";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { priorities, webhookEvents, type RoutingRule } from "../db/schema";
import { decryptJson, encryptJson, randomToken } from "../lib/crypto";
import { publish } from "../lib/events";
import { AppError, badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { checkUrlShape, UnsafeUrlError } from "../lib/ssrf";
import { body, parse, type AppEnv } from "../http";
import { describeProvider, getProvider, providers } from "../integrations";
import { handleFor, loadConnection, markConnection } from "../integrations/connections";
import { IntegrationError } from "../integrations/http";
import { saveConnection, startAuthorisation } from "../integrations/oauth";
import { attempt } from "../delivery/worker";
import { eventEnvelope, testReport } from "../delivery/payload";
import { defaultPolicy, effectivePolicy, policySchema, shapeReport } from "../delivery/policy";
import { loadProject } from "./projects";

/** Turns a provider failure into a 422 the dashboard can show beside the form. */
function asAppError(err: unknown): never {
  if (err instanceof IntegrationError) throw new AppError(422, err.reconnect ? "reconnect" : "integration_error", err.message);
  if (err instanceof UnsafeUrlError) throw badRequest(err.message);
  throw err;
}

const connectionView = (row: typeof schema.connections.$inferSelect) => ({
  id: row.id,
  provider: row.provider,
  authType: row.authType,
  account: row.account,
  status: row.status,
  lastError: row.lastError,
  createdAt: row.createdAt,
});

/* ------------------------------------------------------------------ connections */

export const connectionRoutes = new Hono<AppEnv>()
  .get("/providers", (c) => c.json({ providers: providers.map(describeProvider) }))
  .get("/", async (c) => {
    const rows = await db.query.connections.findMany({ where: eq(schema.connections.orgId, c.get("orgId")), orderBy: schema.connections.createdAt });
    const usage = await db.execute<{ connection_id: string; n: number }>(
      sql`select connection_id, count(*)::int as n from destinations where org_id = ${c.get("orgId")} and connection_id is not null group by connection_id`,
    );
    const counts = new Map(usage.map((u) => [u.connection_id, u.n]));
    return c.json({ connections: rows.map((r) => ({ ...connectionView(r), destinationCount: counts.get(r.id) ?? 0 })) });
  })
  .post("/", async (c) => {
    // Service account keys run to a few kilobytes.
    const input = await body(c, z.object({ provider: z.string(), fields: z.record(z.string(), z.string().max(12_000)) }));
    const provider = getProvider(input.provider);
    if (!provider?.connectWithToken || !provider.tokenFields) throw badRequest("That service can't be connected with a token.");
    for (const f of provider.tokenFields) if (!f.optional && !input.fields[f.key]?.trim()) throw badRequest(`${f.key}: Enter the ${f.label.toLowerCase()}.`);
    try {
      const result = await provider.connectWithToken(input.fields);
      const id = await saveConnection(c.get("orgId"), c.get("user").id, provider, result, "token");
      const row = await loadConnection(c.get("orgId"), id);
      return c.json({ connection: connectionView(row) }, 201);
    } catch (err) {
      asAppError(err);
    }
  })
  .post("/authorize/:provider", async (c) => {
    const input = await body(c, z.object({ returnTo: z.string().max(300).optional() }));
    const url = await startAuthorisation(c.get("orgId"), c.get("user").id, c.req.param("provider"), input.returnTo);
    return c.json({ url });
  })
  .post("/:id/validate", async (c) => {
    const row = await loadConnection(c.get("orgId"), c.req.param("id"));
    const provider = getProvider(row.provider);
    if (!provider?.validate) return c.json({ connection: connectionView(row) });
    try {
      const account = await provider.validate(handleFor(row));
      await db.update(schema.connections).set({ account, status: "active", lastError: null, updatedAt: new Date() }).where(eq(schema.connections.id, row.id));
    } catch (err) {
      if (err instanceof IntegrationError) {
        await markConnection(row.id, "error", err.message);
        throw new AppError(422, "integration_error", err.message);
      }
      throw err;
    }
    return c.json({ connection: connectionView(await loadConnection(c.get("orgId"), row.id)) });
  })
  .get("/:id/targets", async (c) => {
    const row = await loadConnection(c.get("orgId"), c.req.param("id"));
    const provider = getProvider(row.provider);
    if (!provider?.listTargets) return c.json({ targets: [] });
    try {
      return c.json({ targets: await provider.listTargets(handleFor(row)) });
    } catch (err) {
      if (err instanceof IntegrationError && err.reconnect) await markConnection(row.id, "error", err.message);
      asAppError(err);
    }
  })
  .delete("/:id", async (c) => {
    const row = await loadConnection(c.get("orgId"), c.req.param("id"));
    await db.delete(schema.connections).where(eq(schema.connections.id, row.id));
    return c.json({ ok: true });
  });

/* ------------------------------------------------------------------ destinations */

const ruleSchema = z.object({
  priorities: z.array(z.enum(priorities)).max(4).optional(),
  sources: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  environments: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

const destinationInput = z.object({
  provider: z.string(),
  connectionId: z.string().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  target: z.record(z.string(), z.unknown()).default({}),
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  url: z.string().trim().max(2000).optional(),
  events: z.array(z.enum(webhookEvents)).min(1, "Choose at least one event.").optional(),
  rule: ruleSchema.optional(),
  policy: policySchema.optional(),
  /** Webhooks only. Stored encrypted with the URL, since they often carry tokens. */
  headers: z
    .record(
      z
        .string()
        .trim()
        .min(1)
        .max(60)
        .regex(/^[A-Za-z0-9-]+$/, "Header names use letters, numbers and dashes."),
      z.string().max(1000),
    )
    .refine((h) => Object.keys(h).length <= 20, "Add up to 20 headers.")
    .refine((h) => !Object.keys(h).some((k) => /^(content-type|issueit-|host$|content-length)/i.test(k)), "Issueit sets that header itself.")
    .optional(),
});

function checkWebhookUrl(url: string | undefined) {
  if (!url) throw badRequest("url: Enter the URL Issueit should send events to.");
  try {
    return checkUrlShape(url).toString();
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw badRequest(`url: ${err.message}`);
    throw err;
  }
}

const cleanRule = (rule: RoutingRule | undefined): RoutingRule => {
  if (!rule) return {};
  const out: RoutingRule = {};
  if (rule.priorities?.length) out.priorities = rule.priorities;
  if (rule.sources?.length) out.sources = rule.sources;
  if (rule.environments?.length) out.environments = rule.environments;
  return out;
};

type WebhookSecrets = { url: string; signingSecret: string; headers?: Record<string, string> };

/** Never includes secrets; webhook URLs are shown by host only until revealed, headers by name only. */
function destinationView(d: typeof schema.destinations.$inferSelect) {
  let host: string | null = null;
  let headerNames: string[] = [];
  if (d.provider === "webhook" && d.secrets) {
    try {
      const secrets = decryptJson<WebhookSecrets>(d.secrets);
      host = new URL(secrets.url).host;
      headerNames = Object.keys(secrets.headers ?? {});
    } catch {
      host = null;
    }
  }
  return {
    id: d.id,
    provider: d.provider,
    connectionId: d.connectionId,
    name: d.name,
    target: d.target,
    enabled: d.enabled,
    events: d.events,
    rule: d.rule,
    policy: d.policy,
    pausedReason: d.pausedReason,
    syncState: d.syncState,
    webhookHost: host,
    headerNames,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function loadDestination(projectId: string, id: string) {
  const d = await db.query.destinations.findFirst({ where: and(eq(schema.destinations.id, id), eq(schema.destinations.projectId, projectId)) });
  if (!d) throw notFound("That destination");
  return d;
}

/** Destinations with their delivery counts and connection, for one project or the whole organisation. */
async function destinationsWithStats(orgId: string, projectId?: string) {
  const rows = await db.query.destinations.findMany({
    where: projectId ? eq(schema.destinations.projectId, projectId) : eq(schema.destinations.orgId, orgId),
    orderBy: schema.destinations.createdAt,
  });
  const stats = await db.execute<{
    destination_id: string;
    delivered: number;
    failed: number;
    pending: number;
    week_delivered: number;
    week_failed: number;
    avg_ms: number | null;
    last_status: string | null;
    last_at: Date | null;
    last_error: string | null;
  }>(sql`
    select d.id as destination_id,
      (select count(*)::int from deliveries x where x.destination_id = d.id and x.status = 'delivered' and not x.is_test) as delivered,
      (select count(*)::int from deliveries x where x.destination_id = d.id and x.status = 'failed') as failed,
      (select count(*)::int from deliveries x where x.destination_id = d.id and x.status in ('pending', 'delivering', 'retrying')) as pending,
      (select count(*)::int from deliveries x where x.destination_id = d.id and x.status = 'delivered' and not x.is_test and x.created_at > now() - interval '7 days') as week_delivered,
      (select count(*)::int from deliveries x where x.destination_id = d.id and x.status = 'failed' and not x.is_test and x.created_at > now() - interval '7 days') as week_failed,
      (select avg(x.duration_ms)::int from deliveries x where x.destination_id = d.id and x.status = 'delivered' and x.created_at > now() - interval '30 days') as avg_ms,
      l.status as last_status, l.updated_at as last_at, l.last_error
    from destinations d
    left join lateral (select status, updated_at, last_error from deliveries x where x.destination_id = d.id order by x.created_at desc limit 1) l on true
    where ${projectId ? sql`d.project_id = ${projectId}` : sql`d.org_id = ${orgId}`}`);
  const byId = new Map(stats.map((s) => [s.destination_id, s]));
  const connections = await db.query.connections.findMany({ where: eq(schema.connections.orgId, orgId) });
  const connById = new Map(connections.map((x) => [x.id, x]));
  const projects = await db.query.projects.findMany({ where: eq(schema.projects.orgId, orgId), columns: { id: true, name: true } });
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  return rows.map((d) => {
    const s = byId.get(d.id);
    const conn = d.connectionId ? connById.get(d.connectionId) : undefined;
    return {
      ...destinationView(d),
      projectId: d.projectId,
      projectName: projectName.get(d.projectId) ?? "",
      connection: conn ? connectionView(conn) : null,
      stats: {
        delivered: s?.delivered ?? 0,
        failed: s?.failed ?? 0,
        pending: s?.pending ?? 0,
        weekDelivered: s?.week_delivered ?? 0,
        weekFailed: s?.week_failed ?? 0,
        avgMs: s?.avg_ms ?? null,
        lastStatus: s?.last_status ?? null,
        lastAt: s?.last_at ?? null,
        lastError: s?.last_error ?? null,
      },
    };
  });
}

/** Every destination in the organisation, for the Integrations page. */
export const orgDestinationRoutes = new Hono<AppEnv>().get("/", async (c) => c.json({ destinations: await destinationsWithStats(c.get("orgId")) }));

/** The built-in delivery policy and the organisation's own defaults on top of it. */
export const policyRoutes = new Hono<AppEnv>().get("/", async (c) => {
  const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, c.get("orgId")), columns: { settings: true } });
  return c.json({ builtIn: defaultPolicy, organisation: org?.settings.delivery ?? {}, effective: effectivePolicy(org?.settings.delivery, {}) });
});

export const destinationRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const project = await loadProject(c);
    return c.json({ destinations: await destinationsWithStats(c.get("orgId"), project.id) });
  })
  .post("/", async (c) => {
    const project = await loadProject(c);
    const input = await body(c, destinationInput);
    const provider = getProvider(input.provider);
    if (!provider) throw badRequest("That service isn't supported.");
    const id = newId("dst");
    let connectionId: string | null = null;
    let secrets: string | null = null;
    let signingSecret: string | null = null;
    let name = input.name;

    if (provider.kind === "webhook") {
      const url = checkWebhookUrl(input.url);
      signingSecret = `whsec_${randomToken(24)}`;
      secrets = encryptJson({ url, signingSecret, ...(input.headers ? { headers: input.headers } : {}) });
      name ??= new URL(url).host;
    } else {
      if (!input.connectionId) throw badRequest("Choose a connected account.");
      const conn = await loadConnection(c.get("orgId"), input.connectionId);
      if (conn.provider !== provider.id) throw badRequest("That account belongs to a different service.");
      connectionId = conn.id;
      if (provider.targetFields?.length) {
        const typed: Record<string, string> = {};
        for (const f of provider.targetFields) {
          const value = typeof input.target[f.key] === "string" ? String(input.target[f.key]).trim().slice(0, 500) : "";
          if (!value && !f.optional) throw badRequest(`${f.key}: Enter the ${f.label.toLowerCase()}.`);
          if (value) typed[f.key] = value;
        }
        input.target = typed;
        name ??= Object.values(typed)[0] ? `${provider.name} · ${Object.values(typed)[0]}` : conn.account.label;
      } else if (provider.targetLabel && !Object.keys(input.target).length) throw badRequest(`Choose a ${provider.targetLabel.toLowerCase()}.`);
      name ??= targetName(input.target) ?? conn.account.label;
    }
    const target = { ...input.target, ...(input.labels ? { labels: input.labels } : {}) };
    const events = (input.events ?? ["report.created"]).filter((e) => provider.events.includes(e));
    if (!events.length) throw badRequest("Choose at least one event.");
    await db.insert(schema.destinations).values({
      id,
      orgId: project.orgId,
      projectId: project.id,
      provider: provider.id,
      connectionId,
      name: name!,
      target,
      secrets,
      events,
      rule: cleanRule(input.rule),
      policy: input.policy ?? {},
    });
    const d = await loadDestination(project.id, id);
    return c.json({ destination: destinationView(d), signingSecret }, 201);
  })
  .patch("/:id", async (c) => {
    const project = await loadProject(c);
    const d = await loadDestination(project.id, c.req.param("id"));
    const input = await body(c, destinationInput.partial().extend({ enabled: z.boolean().optional(), syncState: z.boolean().optional() }));
    const provider = getProvider(d.provider)!;
    const set: Partial<typeof schema.destinations.$inferInsert> = { updatedAt: new Date() };
    if (input.name) set.name = input.name;
    if (input.enabled !== undefined) {
      set.enabled = input.enabled;
      set.pausedReason = null;
    }
    if (input.policy) set.policy = input.policy;
    if (input.syncState !== undefined) set.syncState = input.syncState;
    if (input.rule) set.rule = cleanRule(input.rule);
    if (input.events) set.events = input.events.filter((e) => provider.events.includes(e));
    if (input.target || input.labels) set.target = { ...d.target, ...input.target, ...(input.labels ? { labels: input.labels } : {}) };
    if ((input.url !== undefined || input.headers !== undefined) && provider.kind === "webhook") {
      const current: Partial<WebhookSecrets> = d.secrets ? decryptJson<WebhookSecrets>(d.secrets) : { signingSecret: `whsec_${randomToken(24)}` };
      const url = input.url !== undefined ? checkWebhookUrl(input.url) : current.url;
      if (!url) throw badRequest("url: Enter the URL Issueit should send events to.");
      set.secrets = encryptJson({ ...current, url, ...(input.headers !== undefined ? { headers: input.headers } : {}) });
    }
    await db.update(schema.destinations).set(set).where(eq(schema.destinations.id, d.id));
    return c.json({ destination: destinationView(await loadDestination(project.id, d.id)) });
  })
  .delete("/:id", async (c) => {
    const project = await loadProject(c);
    const d = await loadDestination(project.id, c.req.param("id"));
    await db.delete(schema.destinations).where(eq(schema.destinations.id, d.id));
    return c.json({ ok: true });
  })
  .post("/:id/reveal", async (c) => {
    const project = await loadProject(c);
    const d = await loadDestination(project.id, c.req.param("id"));
    if (!d.secrets) throw badRequest("This destination has no secrets to show.");
    return c.json(decryptJson<{ url: string; signingSecret: string }>(d.secrets));
  })
  .post("/:id/rotate", async (c) => {
    const project = await loadProject(c);
    const d = await loadDestination(project.id, c.req.param("id"));
    if (!d.secrets) throw badRequest("This destination has no signing secret.");
    const current = decryptJson<{ url: string; signingSecret: string }>(d.secrets);
    const signingSecret = `whsec_${randomToken(24)}`;
    await db
      .update(schema.destinations)
      .set({ secrets: encryptJson({ ...current, signingSecret }), updatedAt: new Date() })
      .where(eq(schema.destinations.id, d.id));
    return c.json({ signingSecret });
  })
  /** Sends a clearly marked test report through the saved settings and waits for the outcome. */
  .post("/:id/test", async (c) => {
    const project = await loadProject(c);
    const d = await loadDestination(project.id, c.req.param("id"));
    const org = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, project.orgId), columns: { settings: true } });
    const report = testReport({ id: project.id, name: project.name });
    const shaped = shapeReport(report, effectivePolicy(org?.settings.delivery, d.policy));
    const [delivery] = await db
      .insert(schema.deliveries)
      .values({
        id: newId("dlv"),
        orgId: project.orgId,
        projectId: project.id,
        reportId: null,
        destinationId: d.id,
        event: "report.created",
        idempotencyKey: `test:${d.id}:${randomToken(8)}`,
        payload: d.provider === "webhook" ? eventEnvelope("report.created", shaped, true) : null,
        status: "delivering",
        attempts: 1,
        maxAttempts: 1,
        isTest: true,
      })
      .returning();
    const outcome = await attempt(delivery, report);
    if (!outcome.ok) return c.json({ ok: false, error: outcome.error });
    return c.json({ ok: true, externalUrl: outcome.result.externalUrl ?? null, externalId: outcome.result.externalId ?? null });
  });

function targetName(target: Record<string, unknown>): string | undefined {
  const t = target as Record<string, string | undefined>;
  return t.repo ?? t.path ?? t.teamName ?? t.listName ?? t.databaseName ?? t.projectName ?? undefined;
}

/* ------------------------------------------------------------------ delivery log */

const deliveryQuery = z.object({
  project: z.string().optional(),
  destination: z.string().optional(),
  provider: z.string().max(60).optional(),
  status: z.enum(["pending", "delivering", "delivered", "retrying", "failed"]).optional(),
  q: z.string().trim().max(100).optional(),
  tests: z.enum(["include", "exclude", "only"]).default("include"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const deliveryRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const q = parse(deliveryQuery, c.req.query());
    const dl = schema.deliveries;
    const where: SQL[] = [eq(dl.orgId, c.get("orgId"))];
    if (q.project) where.push(eq(dl.projectId, q.project));
    if (q.destination) where.push(eq(dl.destinationId, q.destination));
    if (q.status) where.push(eq(dl.status, q.status));
    if (q.provider) where.push(eq(schema.destinations.provider, q.provider));
    if (q.tests === "exclude") where.push(eq(dl.isTest, false));
    if (q.tests === "only") where.push(eq(dl.isTest, true));
    if (q.q) where.push(sql`(${schema.reports.title} ilike ${`%${q.q.replace(/[%_\\]/g, "\\$&")}%`} or ${dl.lastError} ilike ${`%${q.q.replace(/[%_\\]/g, "\\$&")}%`})`);
    const rows = await db
      .select({
        id: dl.id,
        event: dl.event,
        status: dl.status,
        attempts: dl.attempts,
        maxAttempts: dl.maxAttempts,
        lastError: dl.lastError,
        responseStatus: dl.responseStatus,
        externalId: dl.externalId,
        externalUrl: dl.externalUrl,
        isTest: dl.isTest,
        nextAttemptAt: dl.nextAttemptAt,
        deliveredAt: dl.deliveredAt,
        createdAt: dl.createdAt,
        updatedAt: dl.updatedAt,
        reportId: dl.reportId,
        reportTitle: schema.reports.title,
        destinationId: dl.destinationId,
        destinationName: schema.destinations.name,
        provider: schema.destinations.provider,
        durationMs: dl.durationMs,
        projectId: dl.projectId,
      })
      .from(dl)
      .innerJoin(schema.destinations, eq(schema.destinations.id, dl.destinationId))
      .leftJoin(schema.reports, eq(schema.reports.id, dl.reportId))
      .where(and(...where))
      .orderBy(desc(dl.createdAt))
      .limit(q.limit);
    return c.json({ deliveries: rows });
  })
  /** One delivery with its attempt history and, for webhooks, the exact body sent. */
  .get("/:id", async (c) => {
    const row = await db.query.deliveries.findFirst({ where: and(eq(schema.deliveries.id, c.req.param("id")), eq(schema.deliveries.orgId, c.get("orgId"))) });
    if (!row) throw notFound("That delivery");
    const destination = await db.query.destinations.findFirst({ where: eq(schema.destinations.id, row.destinationId), columns: { name: true, provider: true } });
    const report = row.reportId ? await db.query.reports.findFirst({ where: eq(schema.reports.id, row.reportId), columns: { title: true, number: true } }) : null;
    return c.json({
      delivery: {
        id: row.id,
        event: row.event,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        lastError: row.lastError,
        responseStatus: row.responseStatus,
        externalId: row.externalId,
        externalUrl: row.externalUrl,
        isTest: row.isTest,
        nextAttemptAt: row.nextAttemptAt,
        deliveredAt: row.deliveredAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        durationMs: row.durationMs,
        attemptLog: row.attemptLog,
        payload: row.payload,
        projectId: row.projectId,
        reportId: row.reportId,
        reportTitle: report?.title ?? null,
        reportNumber: report?.number ?? null,
        destinationId: row.destinationId,
        destinationName: destination?.name ?? "",
        provider: destination?.provider ?? "",
      },
    });
  })
  /** Queues another attempt for every failed delivery that matches, e.g. after fixing a destination. */
  .post("/retry-failed", async (c) => {
    const input = await body(c, z.object({ project: z.string().optional(), destination: z.string().optional(), provider: z.string().optional() }));
    const rows = await db.execute<{ id: string }>(sql`
      update deliveries x set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, updated_at = now()
      from destinations d
      where d.id = x.destination_id and x.org_id = ${c.get("orgId")} and x.status = 'failed' and not x.is_test
        ${input.project ? sql`and x.project_id = ${input.project}` : sql``}
        ${input.destination ? sql`and x.destination_id = ${input.destination}` : sql``}
        ${input.provider ? sql`and d.provider = ${input.provider}` : sql``}
      returning x.id`);
    if (rows.length) {
      await publish({ type: "delivery.queued", orgId: c.get("orgId") });
      await publish({ type: "delivery.updated", orgId: c.get("orgId"), projectId: input.project ?? "", reportId: null, deliveryId: rows[0].id });
    }
    return c.json({ queued: rows.length });
  })
  .post("/:id/retry", async (c) => {
    const [row] = await db
      .update(schema.deliveries)
      .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(
        and(eq(schema.deliveries.id, c.req.param("id")), eq(schema.deliveries.orgId, c.get("orgId")), sql`${schema.deliveries.status} in ('failed', 'retrying')`, eq(schema.deliveries.isTest, false)),
      )
      .returning();
    if (!row) throw notFound("That delivery");
    await publish({ type: "delivery.queued", orgId: row.orgId });
    await publish({ type: "delivery.updated", orgId: row.orgId, projectId: row.projectId, reportId: row.reportId, deliveryId: row.id });
    return c.json({ ok: true });
  });
