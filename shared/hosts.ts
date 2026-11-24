/**
 * Which host serves which pages, when an install splits them: the marketing
 * site on one host (issueit.app), the dashboard on another
 * (dash.issueit.app). Used by the server, which redirects page requests, and
 * by the dashboard, whose links between pages never reach the server.
 *
 * A single-origin install (the self-hosted default: APP_URL and
 * MARKETING_URL the same) never redirects anything.
 */

/** Every page that belongs to the dashboard: signing in and everything after it. */
const appPrefixes = [
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/verify",
  "/invite",
  "/device",
  "/oauth",
  "/start",
  "/dashboard",
  "/inbox",
  "/projects",
  "/integrations",
  "/widget",
  "/usage",
  "/settings",
];

export const isAppPath = (path: string) => appPrefixes.some((p) => path === p || path.startsWith(`${p}/`));

/** Documentation answers on any host; it has its own subdomain and its own redirect. */
const isDocsPath = (path: string) => path === "/docs" || path.startsWith("/docs/");

export type Hosts = {
  app: string;
  marketing: string;
  /** The install's other public addresses (intake, CDN): redirected from, never to. */
  others?: string[];
};

const hostOf = (url: string) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Where a page request should go instead, or null to serve it here.
 * `host` is the request's host (with port), `path` its path, `rest` the
 * query and fragment to carry over.
 */
export function redirectFor(hosts: Hosts, host: string, path: string, rest = ""): string | null {
  const app = hostOf(hosts.app);
  const marketing = hostOf(hosts.marketing);
  const here = host.toLowerCase();
  if (!app || !marketing || app === marketing) return null;
  // The documentation subdomain routes everything as documentation.
  if (here.startsWith("docs.")) return null;
  // Only the install's own addresses. Anything else — a LAN address, a
  // proxy that rewrote the Host header — is served as it always was, so a
  // misreported host can never turn into a redirect loop.
  const known = [app, marketing, `www.${marketing}`, ...(hosts.others ?? []).map(hostOf)];
  if (!known.includes(here)) return null;
  if (isAppPath(path)) return here === app ? null : `${hosts.app}${path}${rest}`;
  if (here === marketing || here === `www.${marketing}` || isDocsPath(path)) return null;
  // The dashboard's own front door is the dashboard, not the marketing home.
  if (here === app && path === "/") return `${hosts.app}/start${rest}`;
  return `${hosts.marketing}${path}${rest}`;
}
