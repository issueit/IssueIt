import { safeEqual, sign } from "../lib/crypto";

/**
 * A short-lived token for a browser, minted by your own server with a secret
 * key. It lets a single-page app send reports without the project being open
 * to anyone who finds the project id, and without a secret key ever reaching
 * a web page.
 *
 * It is signed rather than stored: nothing to look up, nothing to clean out,
 * and it stops working on its own.
 */

const PREFIX = "it_";
export const MAX_TOKEN_SECONDS = 3600;

export function mintBrowserToken(projectId: string, seconds: number): { token: string; expiresAt: Date } {
  const expires = Math.floor(Date.now() / 1000) + Math.min(Math.max(seconds, 30), MAX_TOKEN_SECONDS);
  const body = `${projectId}.${expires}`;
  return { token: `${PREFIX}${body}.${sign(body)}`, expiresAt: new Date(expires * 1000) };
}

export const isBrowserToken = (token: string) => token.startsWith(PREFIX);

/** The project a token is good for, or null if it is forged, malformed or past its time. */
export function readBrowserToken(token: string): { projectId: string } | null {
  if (!isBrowserToken(token)) return null;
  const parts = token.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return null;
  const [projectId, expires, signature] = parts;
  if (!safeEqual(sign(`${projectId}.${expires}`), signature)) return null;
  if (!/^\d+$/.test(expires) || Number(expires) * 1000 < Date.now()) return null;
  return { projectId };
}
