/**
 * One build serves three faces: the app, the documentation and the support
 * articles. Hosted installs put documentation on its own subdomain, so the
 * same routes have to answer at `/` there and under `/docs` everywhere else.
 * Nothing here reads configuration — the hostname in the address bar is the
 * only thing that knows where this page is being served from, which keeps a
 * self-hosted install on one origin working with no setting at all.
 */

const host = typeof window === "undefined" ? "" : window.location.hostname;

/** True on docs.example.com, false on example.com/docs and on localhost. */
export const onDocsHost = /^docs\./i.test(host);

/** Where the app itself lives, for links that have to leave the docs subdomain. */
export const appOrigin = onDocsHost ? window.location.origin.replace("//docs.", "//") : window.location.origin;

/** The prefix every documentation route sits behind: nothing, or `/docs`. */
export const docsBase = onDocsHost ? "" : "/docs";

/**
 * A documentation link. Paths are given as they appear in the nav
 * (`"/collect/widget"`, or `"/"` for the index) and come back ready for the
 * router on whichever host this is.
 */
export function docsHref(path = "/"): string {
  const clean = path === "/" ? "" : path.replace(/\/+$/, "");
  return `${docsBase}${clean}` || "/";
}

/**
 * A link to a page of the app or marketing site. Absolute from the docs
 * subdomain, relative everywhere else, so the router keeps handling it.
 */
export function appHref(path: string): string {
  return onDocsHost ? `${appOrigin}${path}` : path;
}

/** A support article's address. Articles are always served from the app's own host. */
export function articleHref(slug: string, locale = "en"): string {
  return appHref(`/articles/${locale}/${slug}`);
}
