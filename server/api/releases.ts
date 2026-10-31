import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { AppError, badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { storage } from "../lib/storage";
import { fileKey, SourceMap, symbolicateStack } from "../lib/sourcemap";
import { body, parse, type AppEnv } from "../http";
import { loadProject } from "./projects";
import type { ConsoleEntry, Diagnostics } from "../db/schema";

/**
 * Releases and their source maps. A report names the build it happened on;
 * the maps for that build turn a minified frame into a file and a line, at
 * the moment someone reads the report rather than when it arrived, so maps
 * uploaded after a crash still help.
 */

const MAX_MAP_BYTES = 40 * 1024 * 1024;

const releaseInput = z.object({
  version: z.string().trim().min(1, "Name the build.").max(80),
  dist: z.string().trim().max(40).nullable().optional(),
  commit: z.string().trim().max(80).nullable().optional(),
  url: z.string().trim().max(500).url("Use a full URL.").nullable().optional().or(z.literal("")),
});

export const releaseRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const project = await loadProject(c);
    const rows = await db
      .select({
        id: schema.releases.id,
        version: schema.releases.version,
        dist: schema.releases.dist,
        commit: schema.releases.commit,
        url: schema.releases.url,
        createdAt: schema.releases.createdAt,
        // Qualified by hand: with no join in the query, drizzle writes a bare
        // "id", which a subquery resolves against its own table instead.
        maps: sql<number>`(select count(*)::int from source_maps m where m.release_id = releases.id)`,
        reports: sql<number>`(select count(*)::int from reports r where r.project_id = ${project.id} and r.release = releases.version)`,
      })
      .from(schema.releases)
      .where(eq(schema.releases.projectId, project.id))
      .orderBy(desc(schema.releases.createdAt))
      .limit(100);
    return c.json({ releases: rows });
  })

  /** Idempotent: naming a release that already exists returns it. */
  .post("/", async (c) => {
    const project = await loadProject(c);
    const input = await body(c, releaseInput);
    const [row] = await db
      .insert(schema.releases)
      .values({
        id: newId("rel"),
        orgId: project.orgId,
        projectId: project.id,
        version: input.version,
        dist: input.dist || null,
        commit: input.commit || null,
        url: input.url || null,
      })
      .onConflictDoUpdate({
        target: [schema.releases.projectId, schema.releases.version, schema.releases.dist],
        set: { commit: sql`coalesce(excluded.commit, ${schema.releases.commit})`, url: sql`coalesce(excluded.url, ${schema.releases.url})` },
      })
      .returning();
    return c.json({ release: row }, 201);
  })

  .delete("/:id", async (c) => {
    const project = await loadProject(c);
    const release = await load(project.id, c.req.param("id"));
    await db.delete(schema.releases).where(eq(schema.releases.id, release.id));
    await storage.removePrefix(`${project.orgId}/${project.id}/maps/${release.id}`).catch(() => {});
    return c.json({ ok: true });
  })

  .get("/:id/sourcemaps", async (c) => {
    const project = await loadProject(c);
    const release = await load(project.id, c.req.param("id"));
    const maps = await db
      .select({ id: schema.sourceMaps.id, file: schema.sourceMaps.file, sizeBytes: schema.sourceMaps.sizeBytes, createdAt: schema.sourceMaps.createdAt })
      .from(schema.sourceMaps)
      .where(eq(schema.sourceMaps.releaseId, release.id))
      .orderBy(schema.sourceMaps.file);
    return c.json({ sourcemaps: maps });
  })

  /**
   * One map, named after the built file it belongs to. Sent as the raw body
   * so a build script can pipe it straight in; uploading the same file again
   * replaces it, which makes a re-run of a deploy harmless.
   */
  .put(
    "/:id/sourcemaps",
    bodyLimit({ maxSize: MAX_MAP_BYTES, onError: () => { throw new AppError(413, "payload_too_large", `Source maps can be up to ${MAX_MAP_BYTES / 1024 / 1024} MB.`); } }),
    async (c) => {
      const project = await loadProject(c);
      const release = await load(project.id, c.req.param("id"));
      const file = fileKey(parse(z.string().trim().min(1, "Name the built file this maps, e.g. assets/app-8fd2.js.").max(300), c.req.query("file")));

      const text = await c.req.text();
      if (!text.trim()) throw badRequest("The source map is empty.");
      if (!SourceMap.parse(text)) throw badRequest("That isn't a source map Issueit can read. Send the .map file's contents, version 3.");

      const id = newId("att");
      const key = `${project.orgId}/${project.id}/maps/${release.id}/${id}`;
      await storage.put(key, new TextEncoder().encode(text));
      const existing = await db.query.sourceMaps.findFirst({ where: and(eq(schema.sourceMaps.releaseId, release.id), eq(schema.sourceMaps.file, file)) });
      if (existing) {
        await db.update(schema.sourceMaps).set({ storageKey: key, sizeBytes: text.length, createdAt: new Date() }).where(eq(schema.sourceMaps.id, existing.id));
        await storage.remove(existing.storageKey).catch(() => {});
      } else {
        await db.insert(schema.sourceMaps).values({ id, orgId: project.orgId, releaseId: release.id, file, storageKey: key, sizeBytes: text.length });
      }
      maps.clear();
      return c.json({ ok: true, file, bytes: text.length, replaced: !!existing }, existing ? 200 : 201);
    },
  );

async function load(projectId: string, id: string) {
  const row = await db.query.releases.findFirst({ where: and(eq(schema.releases.id, id), eq(schema.releases.projectId, projectId)) });
  if (!row) throw notFound("That release");
  return row;
}

/* ------------------------------------------------------- symbolication */

/** Parsed maps, kept briefly: reading a report shouldn't re-parse megabytes. */
const maps = new Map<string, { at: number; map: SourceMap | null }>();
const CACHE_MS = 5 * 60_000;
const CACHE_MAX = 40;

async function mapFor(storageKey: string): Promise<SourceMap | null> {
  const hit = maps.get(storageKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.map;
  let parsed: SourceMap | null = null;
  try {
    parsed = SourceMap.parse((await storage.read(storageKey)).toString("utf8"));
  } catch {
    parsed = null;
  }
  if (maps.size >= CACHE_MAX) maps.clear();
  maps.set(storageKey, { at: Date.now(), map: parsed });
  return parsed;
}

/**
 * Rewrites the stacks in a report's console entries using the maps uploaded
 * for its release. The built location stays in `stack`; the readable one is
 * added as `original`, so nothing is lost if a map turns out to be wrong.
 */
export async function symbolicate(report: { projectId: string; release: string | null; diagnostics: Diagnostics }): Promise<Diagnostics> {
  const entries = report.diagnostics.console;
  if (!report.release || !entries?.some((e) => e.stack)) return report.diagnostics;

  const rows = await db
    .select({ file: schema.sourceMaps.file, storageKey: schema.sourceMaps.storageKey })
    .from(schema.sourceMaps)
    .innerJoin(schema.releases, eq(schema.releases.id, schema.sourceMaps.releaseId))
    .where(and(eq(schema.releases.projectId, report.projectId), eq(schema.releases.version, report.release)));
  if (!rows.length) return report.diagnostics;

  const loaded = new Map<string, SourceMap>();
  for (const row of rows) {
    const map = await mapFor(row.storageKey);
    if (map) loaded.set(row.file, map);
  }
  if (!loaded.size) return report.diagnostics;

  const console: ConsoleEntry[] = entries.map((entry) => {
    if (!entry.stack) return entry;
    const { stack, changed } = symbolicateStack(entry.stack, (file) => loaded.get(file));
    return changed ? { ...entry, original: stack } : entry;
  });
  return { ...report.diagnostics, console };
}
