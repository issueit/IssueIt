import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { config } from "../config";
import * as schema from "./schema";

export const sql = postgres(config.databaseUrl, {
  max: 10,
  onnotice: () => {},
  transform: { undefined: null },
});

export const db = drizzle(sql, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Runs pending migrations. Looks for ./drizzle next to the bundle or the repo root. */
export async function runMigrations() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../../drizzle"), path.resolve(here, "../drizzle"), path.resolve("drizzle")];
  const folder = candidates.find((c) => fs.existsSync(path.join(c, "meta", "_journal.json")));
  if (!folder) throw new Error("Migrations folder not found");
  await migrate(db, { migrationsFolder: folder });
}

export { schema };
