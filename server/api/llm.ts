import fs from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import { config } from "../config";

/**
 * The machine-readable documentation: llms.txt, the whole corpus in one file,
 * a JSON manifest, and every documentation page or support article as
 * Markdown at its own address with `.md` on the end.
 *
 * The files are written by `npm run build:llms` from the same React pages the
 * site renders, with this install's addresses left as tokens, because a build
 * can't know whether intake will answer at drop.issueit.app or at the one
 * origin a self-hosted install serves everything from. Filling them in here
 * means a sample copied out of the Markdown is as runnable as one copied out
 * of the page.
 */

const TOKENS: Record<string, string> = {
  __APP_URL__: config.appUrl,
  __DROP_URL__: config.dropUrl,
  __CDN_URL__: config.cdnUrl,
  __DOCS_URL__: config.docsUrl,
  __MARKETING_URL__: config.marketingUrl,
};

const fill = (text: string) => text.replace(/__(?:APP|DROP|CDN|DOCS|MARKETING)_URL__/g, (token) => TOKENS[token] ?? token);

/**
 * Which file answers a `.md` address. Documentation pages are served from
 * `/docs/...` on the app's own host and from the root of the documentation
 * subdomain, so both spellings land on the same file. The patterns are
 * deliberately narrow: these paths come from the address bar.
 */
/** Addresses that belong to something else, even when they end in .md: an attachment can be called anything. */
const RESERVED = /^\/(v1|api|mcp|metrics|health|assets|oauth|a|r|e)(\/|$)/;

export function markdownFile(requested: string): string | null {
  if (RESERVED.test(requested)) return null;
  const clean = requested.replace(/\.md$/, "");
  const article = /^\/articles\/([a-z]{2})\/([a-z0-9-]+)$/.exec(clean);
  if (article) return `articles/${article[1]}/${article[2]}.md`;
  if (clean === "/llm") return "llm.md";
  const slug = clean.replace(/^\/docs/, "") || "/index";
  if (!/^(\/[a-z0-9-]+){1,3}$/.test(slug)) return null;
  return `docs${slug}.md`;
}

/**
 * `roots` are the places dist/llm might be, in order. They are looked at on
 * the first request rather than at startup, because the documentation is
 * built by its own command: a server started before `npm run build:llms`
 * finished would otherwise answer 404 for the rest of its life.
 */
export function llmRoutes(roots: string[]) {
  const app = new Hono();
  // Built once per deployment, so a file is read and filled in once.
  const cache = new Map<string, string | null>();
  let root: string | null = null;

  function read(file: string): string | null {
    root ??= roots.find((dir) => fs.existsSync(path.join(dir, "llms.txt"))) ?? null;
    if (!root) return null;
    const cached = cache.get(file);
    if (cached !== undefined) return cached;
    const full = path.join(root, file);
    const body = full.startsWith(root) && fs.existsSync(full) ? fill(fs.readFileSync(full, "utf8")) : null;
    cache.set(file, body);
    return body;
  }

  /** Public, quotable and meant to be fetched by something that isn't a browser. */
  const serve = (file: string, type: string) => (c: Context) => {
    const body = read(file);
    if (body === null) return missing();
    c.header("content-type", `${type}; charset=utf-8`);
    c.header("cache-control", "public, max-age=300");
    c.header("access-control-allow-origin", "*");
    return c.body(body);
  };

  /** Nothing built, or nothing there: say where the index is rather than returning a page of HTML. */
  const missing = () =>
    new Response(`Not found.\n\nThe index of everything Issueit publishes for machines is at ${config.marketingUrl}/llms.txt\n`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" },
    });

  app.get("/llms.txt", serve("llms.txt", "text/plain"));
  app.get("/llms-full.txt", serve("llms-full.txt", "text/plain"));
  app.get("/llm/index.json", serve("index.json", "application/json"));

  /**
   * Any page, with `.md` on the end. A wildcard rather than a pattern per
   * shape, because this has to answer at `/collect/widget.md` on the
   * documentation subdomain and `/docs/collect/widget.md` on the app's.
   */
  app.get("/*", async (c, next) => {
    if (!c.req.path.endsWith(".md")) return next();
    const file = markdownFile(c.req.path);
    // Not an address of ours: the attachment and intake routes answer some of these.
    if (!file) return next();
    const body = read(file);
    if (!body) return missing();
    c.header("content-type", "text/markdown; charset=utf-8");
    c.header("cache-control", "public, max-age=300");
    c.header("access-control-allow-origin", "*");
    return c.body(body);
  });

  return app;
}
