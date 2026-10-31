import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { defaultWidgetConfig, emailsWithDefaults, widgetWithDefaults, type ProjectRules } from "../db/schema";
import { decryptJson, encryptJson, randomToken } from "../lib/crypto";
import { badRequest, forbidden } from "../lib/errors";
import { newId } from "../lib/ids";
import { checkUrlShape, UnsafeUrlError } from "../lib/ssrf";
import { compilePatterns, scrubText } from "../lib/scrub";
import { fingerprintFor, normalisePath, normaliseTitle } from "../ingest/grouping";
import { body, type AppEnv } from "../http";
import { getProvider } from "../integrations";
import { loadProject } from "./projects";

/**
 * A project as a file: everything that decides how it behaves, in one
 * document you can keep in the repository, diff in a pull request and apply
 * to staging and production alike.
 *
 * Ids are deliberately absent. Destinations are matched by name and
 * connections by the account they belong to, because those are the things
 * that mean the same in two environments; an id is not.
 */

type WebhookSecrets = { url: string; signingSecret: string; headers?: Record<string, string> };

const ruleSchema = z.object({
  priorities: z.array(z.string()).max(4).optional(),
  sources: z.array(z.string()).max(20).optional(),
  environments: z.array(z.string()).max(20).optional(),
});

const destinationDoc = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(40),
  /** The connected account, by the label the dashboard shows. */
  connection: z.string().trim().max(200).nullable().optional(),
  target: z.record(z.string(), z.unknown()).default({}),
  url: z.string().trim().max(2000).nullable().optional(),
  enabled: z.boolean().default(true),
  events: z.array(z.string()).optional(),
  rule: ruleSchema.optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  syncState: z.boolean().optional(),
});

const configDoc = z.object({
  /** The shape of the document, so an old file gives a clear error rather than odd behaviour. */
  version: z.literal(1).default(1),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  publicSubmissions: z.boolean().optional(),
  allowedOrigins: z.array(z.string().trim().max(200)).max(50).optional(),
  groupDuplicates: z.boolean().optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  widget: z.record(z.string(), z.unknown()).optional(),
  emails: z.record(z.string(), z.unknown()).optional(),
  destinations: z.array(destinationDoc).max(50).optional(),
});

export type ConfigDoc = z.infer<typeof configDoc>;

export const configRoutes = new Hono<AppEnv>()
  /**
   * The project as a document. Webhook URLs are left out unless asked for,
   * because they often carry a token in the path.
   */
  .get("/", async (c) => {
    const project = await loadProject(c);
    const withSecrets = c.req.query("secrets") === "1";
    if (withSecrets && c.get("token") && !c.get("token")!.scopes.includes("destinations:write")) {
      throw forbidden('Revealing webhook URLs needs the "destinations:write" scope.');
    }

    const destinations = await db.query.destinations.findMany({ where: eq(schema.destinations.projectId, project.id), orderBy: schema.destinations.createdAt });
    const connections = await db.query.connections.findMany({ where: eq(schema.connections.orgId, project.orgId) });
    const byId = new Map(connections.map((x) => [x.id, x]));

    const widget = widgetWithDefaults(project.widget);
    const doc: ConfigDoc & { destinations: Array<Record<string, unknown>> } = {
      version: 1,
      name: project.name,
      description: project.description,
      publicSubmissions: project.publicSubmissions,
      allowedOrigins: project.allowedOrigins,
      groupDuplicates: project.groupDuplicates,
      rules: project.rules,
      // Only what differs from the defaults, so the file stays readable.
      widget: Object.fromEntries(Object.entries(widget).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((defaultWidgetConfig as Record<string, unknown>)[k]))),
      emails: emailsWithDefaults(project.emails),
      destinations: destinations.map((d) => {
        const connection = d.connectionId ? byId.get(d.connectionId) : undefined;
        let url: string | null = null;
        if (d.provider === "webhook" && d.secrets) {
          try {
            const secrets = decryptJson<WebhookSecrets>(d.secrets);
            url = withSecrets ? secrets.url : `https://${new URL(secrets.url).host}/… (pass ?secrets=1 for the whole URL)`;
          } catch {
            url = null;
          }
        }
        return {
          name: d.name,
          provider: d.provider,
          connection: connection?.account.label ?? null,
          target: d.target,
          ...(url ? { url } : {}),
          enabled: d.enabled,
          events: d.events,
          ...(Object.keys(d.rule).length ? { rule: d.rule } : {}),
          ...(Object.keys(d.policy).length ? { policy: d.policy } : {}),
          syncState: d.syncState,
        };
      }),
    };
    return c.json({ config: doc });
  })

  /**
   * Applies a document. `dryRun` says what would change without changing it,
   * which is what you want in a pull request; `prune` removes destinations
   * the file doesn't mention, which is what you want on a deploy.
   */
  .post("/", async (c) => {
    const project = await loadProject(c);
    const input = await body(c, z.object({ config: configDoc, dryRun: z.boolean().default(false), prune: z.boolean().default(false) }));
    const doc = input.config;
    const changes: string[] = [];
    const problems: string[] = [];

    const set: Record<string, unknown> = {};
    const compare = (key: keyof typeof doc, current: unknown, label = String(key)) => {
      if (doc[key] === undefined) return;
      if (JSON.stringify(doc[key]) === JSON.stringify(current)) return;
      set[key] = doc[key];
      changes.push(`${label}: ${short(current)} → ${short(doc[key])}`);
    };
    compare("name", project.name);
    compare("description", project.description);
    compare("publicSubmissions", project.publicSubmissions, "anonymous reports");
    compare("allowedOrigins", project.allowedOrigins, "allowed sites");
    compare("groupDuplicates", project.groupDuplicates, "duplicate grouping");

    if (doc.rules) {
      const problemsHere = checkRules(doc.rules as ProjectRules);
      problems.push(...problemsHere);
      if (!problemsHere.length && JSON.stringify(doc.rules) !== JSON.stringify(project.rules)) {
        set.rules = doc.rules;
        changes.push("rules changed");
      }
    }
    if (doc.widget) {
      const next = { ...widgetWithDefaults(project.widget), ...doc.widget };
      const differs = Object.keys(doc.widget).filter((k) => JSON.stringify((widgetWithDefaults(project.widget) as Record<string, unknown>)[k]) !== JSON.stringify(doc.widget![k]));
      if (differs.length) {
        set.widget = next;
        changes.push(`widget: ${differs.join(", ")}`);
      }
    }
    if (doc.emails) {
      const next = { ...emailsWithDefaults(project.emails), ...doc.emails };
      if (JSON.stringify(next) !== JSON.stringify(emailsWithDefaults(project.emails))) {
        set.emails = next;
        changes.push("reporter emails changed");
      }
    }

    /* ---------------------------------------------------- destinations */
    const existing = await db.query.destinations.findMany({ where: eq(schema.destinations.projectId, project.id) });
    const connections = await db.query.connections.findMany({ where: eq(schema.connections.orgId, project.orgId) });
    const byName = new Map(existing.map((d) => [d.name.toLowerCase(), d]));
    const named = new Set<string>();
    const toCreate: Array<{ doc: z.infer<typeof destinationDoc>; connectionId: string | null; url: string | null }> = [];
    const toUpdate: Array<{ id: string; name: string; set: Record<string, unknown>; what: string[] }> = [];

    for (const want of doc.destinations ?? []) {
      named.add(want.name.toLowerCase());
      const provider = getProvider(want.provider);
      if (!provider) {
        problems.push(`"${want.name}": Issueit doesn't support a service called "${want.provider}".`);
        continue;
      }
      let connectionId: string | null = null;
      if (provider.kind !== "webhook") {
        const matches = connections.filter((x) => x.provider === provider.id && (!want.connection || x.account.label === want.connection));
        if (!matches.length) {
          problems.push(
            `"${want.name}": no ${provider.name} account${want.connection ? ` called "${want.connection}"` : ""} is connected here. Connect one in the dashboard, then apply again.`,
          );
          continue;
        }
        if (matches.length > 1) {
          problems.push(`"${want.name}": ${matches.length} ${provider.name} accounts match. Name the one you mean in "connection".`);
          continue;
        }
        connectionId = matches[0].id;
      }
      let url: string | null = null;
      if (provider.kind === "webhook") {
        if (!want.url || want.url.includes("…")) {
          problems.push(`"${want.name}": a webhook needs its full URL. Export with ?secrets=1 to copy it, or set it here.`);
          continue;
        }
        try {
          url = checkUrlShape(want.url).href;
        } catch (err) {
          problems.push(`"${want.name}": ${err instanceof UnsafeUrlError ? err.message : "that URL can't be used."}`);
          continue;
        }
      }
      const events = (want.events ?? ["report.created"]).filter((e) => (provider.events as readonly string[]).includes(e));
      if (!events.length) {
        problems.push(`"${want.name}": ${provider.name} can't act on any of those events.`);
        continue;
      }

      const current = byName.get(want.name.toLowerCase());
      if (!current) {
        toCreate.push({ doc: { ...want, events }, connectionId, url });
        changes.push(`add destination "${want.name}" (${provider.name})`);
        continue;
      }
      if (current.provider !== provider.id) {
        problems.push(`"${want.name}" already exists here as a ${current.provider} destination. Rename one of them.`);
        continue;
      }
      const diff: Record<string, unknown> = {};
      const what: string[] = [];
      const field = (key: string, next: unknown, now: unknown) => {
        if (next === undefined || JSON.stringify(next) === JSON.stringify(now)) return;
        diff[key] = next;
        what.push(key);
      };
      field("enabled", want.enabled, current.enabled);
      field("events", events, current.events);
      field("target", want.target && Object.keys(want.target).length ? want.target : undefined, current.target);
      field("rule", want.rule, current.rule);
      field("policy", want.policy, current.policy);
      field("syncState", want.syncState, current.syncState);
      field("connectionId", connectionId, current.connectionId);
      if (url) {
        const now = current.secrets ? decryptJson<WebhookSecrets>(current.secrets) : null;
        if (now?.url !== url) {
          diff.secrets = encryptJson({ ...(now ?? { signingSecret: `whsec_${randomToken(24)}` }), url });
          what.push("url");
        }
      }
      if (what.length) {
        toUpdate.push({ id: current.id, name: current.name, set: diff, what });
        changes.push(`change destination "${want.name}": ${what.join(", ")}`);
      }
    }

    const toRemove = doc.destinations ? existing.filter((d) => !named.has(d.name.toLowerCase())) : [];
    for (const d of toRemove) changes.push(prune(input.prune, `destination "${d.name}"`));

    if (input.dryRun) {
      return c.json({ dryRun: true, changes, problems, wouldRemove: toRemove.map((d) => d.name), applied: false });
    }
    if (problems.length) throw badRequest(`This configuration can't be applied yet: ${problems[0]}`, { problems });

    if (Object.keys(set).length) await db.update(schema.projects).set({ ...set, updatedAt: new Date() }).where(eq(schema.projects.id, project.id));
    for (const add of toCreate) {
      await db.insert(schema.destinations).values({
        id: newId("dst"),
        orgId: project.orgId,
        projectId: project.id,
        provider: add.doc.provider,
        connectionId: add.connectionId,
        name: add.doc.name,
        target: add.doc.target,
        secrets: add.url ? encryptJson({ url: add.url, signingSecret: `whsec_${randomToken(24)}` }) : null,
        enabled: add.doc.enabled,
        events: add.doc.events as never,
        rule: (add.doc.rule ?? {}) as never,
        policy: (add.doc.policy ?? {}) as never,
        syncState: add.doc.syncState ?? true,
      });
    }
    for (const change of toUpdate) await db.update(schema.destinations).set({ ...change.set, updatedAt: new Date() }).where(eq(schema.destinations.id, change.id));
    if (input.prune) for (const d of toRemove) await db.delete(schema.destinations).where(eq(schema.destinations.id, d.id));

    return c.json({ dryRun: false, applied: true, changes, problems: [], removed: input.prune ? toRemove.map((d) => d.name) : [] });
  });

const prune = (pruning: boolean, what: string) => (pruning ? `remove ${what}` : `${what} isn't in the file; pass prune to remove it`);
const short = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text && text.length > 60 ? `${text.slice(0, 57)}…` : (text ?? "nothing");
};

/* ------------------------------------------------------- rule previews */

/** Every pattern is compiled here so a bad one is refused at the door, not at intake. */
function checkRules(rules: ProjectRules): string[] {
  const problems: string[] = [];
  for (const pattern of rules.grouping?.titlePatterns ?? []) {
    try {
      new RegExp(pattern);
    } catch (err) {
      problems.push(`Grouping pattern ${JSON.stringify(pattern)} isn't a valid regular expression: ${(err as Error).message}`);
    }
  }
  for (const rule of rules.redaction?.patterns ?? []) {
    try {
      new RegExp(rule.pattern);
    } catch (err) {
      problems.push(`Redaction pattern ${JSON.stringify(rule.pattern)} isn't a valid regular expression: ${(err as Error).message}`);
    }
  }
  return problems;
}

const previewInput = z.object({
  grouping: z.record(z.string(), z.unknown()).optional(),
  redaction: z.record(z.string(), z.unknown()).optional(),
  /** Text to try the redaction rules on. Recent diagnostics are used when it's absent. */
  text: z.string().max(4000).optional(),
  sample: z.coerce.number().int().min(10).max(500).default(100),
});

/**
 * Tries proposed rules against this project's real reports before they are
 * saved. A grouping rule you can't see the effect of is a grouping rule
 * nobody dares change.
 */
export const rulePreviewRoutes = new Hono<AppEnv>().post("/preview", async (c) => {
  const project = await loadProject(c);
  const input = await body(c, previewInput);
  const rules = { grouping: input.grouping, redaction: input.redaction } as ProjectRules;
  const problems = checkRules(rules);

  const recent = await db
    .select({ id: schema.reports.id, number: schema.reports.number, title: schema.reports.title, pageUrl: schema.reports.pageUrl, fingerprint: schema.reports.fingerprint, diagnostics: schema.reports.diagnostics })
    .from(schema.reports)
    .where(eq(schema.reports.projectId, project.id))
    .orderBy(desc(schema.reports.createdAt))
    .limit(input.sample);

  /* How the sample would group under the proposed rules. */
  const groups = new Map<string, Array<{ number: number; title: string }>>();
  for (const r of recent) {
    const fingerprint = problems.length ? r.fingerprint : fingerprintFor({ title: r.title, pageUrl: r.pageUrl }, rules.grouping);
    const key = fingerprint ?? `ungrouped:${r.id}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push({ number: r.number, title: r.title });
  }
  const merged = [...groups.values()]
    .filter((list) => list.length > 1)
    .sort((a, b) => b.length - a.length)
    .slice(0, 10)
    .map((list) => ({ size: list.length, reports: list.slice(0, 5) }));

  const now = new Set(recent.map((r) => r.fingerprint ?? r.id)).size;

  /* The redaction rules against real captured text. */
  const extra = compilePatterns(rules.redaction?.patterns as never);
  const sampleText =
    input.text ??
    recent
      .flatMap((r) => (r.diagnostics.console ?? []).map((e) => e.message))
      .slice(0, 12)
      .join("\n");
  const redaction = sampleText ? { before: sampleText.slice(0, 2000), after: scrubText(sampleText, 2000, extra) } : null;

  return c.json({
    problems,
    grouping: {
      sampled: recent.length,
      distinctNow: now,
      distinctAfter: groups.size,
      merged,
      examples: recent.slice(0, 5).map((r) => ({
        number: r.number,
        title: r.title,
        normalisedTitle: normaliseTitle(r.title, rules.grouping),
        normalisedPage: rules.grouping?.ignorePage ? "(ignored)" : normalisePath(r.pageUrl, rules.grouping),
      })),
    },
    redaction,
  });
});

export { checkRules };
