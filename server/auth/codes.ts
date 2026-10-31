import { and, eq, isNull, gt, lt } from "drizzle-orm";
import { db, schema } from "../db";
import { randomToken, sha256 } from "../lib/crypto";
import { newId } from "../lib/ids";

/**
 * One-time links and codes. The token is returned once and only its hash is
 * stored, so a stolen database can't reset anybody's password, and spending
 * one is a single conditional update: two clicks on the same link can't both
 * win.
 */

export type CodeKind = "reset" | "verify" | "second-factor";

const MINUTES: Record<CodeKind, number> = {
  reset: 60,
  verify: 24 * 60,
  /** Long enough to find your phone, short enough to be worthless if left behind. */
  "second-factor": 10,
};

export async function issueCode(kind: CodeKind, userId: string, email?: string): Promise<string> {
  const token = randomToken(32);
  // Expired codes are useless; clear them out rather than keep them for ever.
  await db.delete(schema.authCodes).where(lt(schema.authCodes.expiresAt, new Date()));
  await db.insert(schema.authCodes).values({
    id: newId("acd"),
    userId,
    kind,
    tokenHash: sha256(token),
    email: email ?? null,
    expiresAt: new Date(Date.now() + MINUTES[kind] * 60_000),
  });
  return token;
}

/** Spends a code and returns who it belonged to, or null if it was no good. */
export async function consumeCode(kind: CodeKind, token: string): Promise<{ userId: string; email: string | null } | null> {
  if (!token) return null;
  const [row] = await db
    .update(schema.authCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.authCodes.tokenHash, sha256(token)),
        eq(schema.authCodes.kind, kind),
        isNull(schema.authCodes.usedAt),
        gt(schema.authCodes.expiresAt, new Date()),
      ),
    )
    .returning({ userId: schema.authCodes.userId, email: schema.authCodes.email });
  return row ?? null;
}

/** Throws away a person's unused codes of one kind, after a password change. */
export async function revokeCodes(kind: CodeKind, userId: string) {
  await db.delete(schema.authCodes).where(and(eq(schema.authCodes.userId, userId), eq(schema.authCodes.kind, kind)));
}
