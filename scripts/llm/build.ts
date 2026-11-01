import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { providers } from "../../server/integrations";
import { allPages, groups } from "../../web/src/pages/docs/nav";
import { pages } from "../../web/src/pages/docs/pages";
import { articles } from "../../web/src/pages/support/articles";
import { categories, categoryTitle } from "../../web/src/pages/support/types";
import { LLM_DETAIL, LLM_ENDPOINTS, LLM_FILES, LLM_SUMMARY, type LlmResource, type LlmUrls } from "../../web/src/lib/llm";
import { markdown, type Links } from "./markdown";

/**
 * Writes the machine-readable documentation into dist/llm: llms.txt, the
 * whole corpus in one file, a Markdown file per page and article, and a JSON
 * manifest of the lot.
 *
 * Addresses are written as tokens — __DOCS_URL__ and the rest — because this
 * runs at build time and every install serves these from somewhere different.
 * The server swaps them for its own configuration on the way out, which is
 * the same trick the documentation's code samples already use.
 */

const TOKENS: LlmUrls = { app: "__APP_URL__", drop: "__DROP_URL__", cdn: "__CDN_URL__", docs: "__DOCS_URL__", marketing: "__MARKETING_URL__" };

/**
 * The pages fetch two things while they render: this install's addresses and
 * the live destination catalogue. There is no server to ask here, so the
 * query stub (see build-llms.mjs) answers from this.
 */
(globalThis as Record<string, unknown>).__LLM_FIXTURES__ = {
  urls: { ...TOKENS, edition: "hosted" },
  catalogue: providers.map((p) => ({ id: p.id, name: p.name, category: p.category, summary: p.summary })),
};

const out = path.resolve("dist/llm");
const today = new Date().toISOString().slice(0, 10);

const docSlugs = new Set(allPages.map((p) => p.slug));
const articleSlugs = new Set(articles.map((a) => a.slug));

/** The file a documentation page is written to, below dist/llm/docs. */
const docFile = (slug: string) => (slug === "/" ? "/index" : slug);
const docHtml = (slug: string) => `${TOKENS.docs}${slug === "/" ? "" : slug}`;
const docMarkdown = (slug: string) => `${TOKENS.docs}${docFile(slug)}.md`;
const articleHtml = (slug: string) => `${TOKENS.app}/articles/en/${slug}`;
const articleMarkdown = (slug: string) => `${articleHtml(slug)}.md`;

/**
 * An address as it appears in the prose, rewritten for a reader who is not on
 * the site: documentation links point at the Markdown rather than the page,
 * because that reader can't run the dashboard anyway.
 */
const links: Links = {
  to(raw) {
    const href = String(raw ?? "");
    if (!href || /^(https?:|mailto:|tel:|#|__)/.test(href)) return href;
    const [base, hash = ""] = href.split(/(?=#)/, 2);
    const clean = base.replace(/\/+$/, "") || "/";
    if (docSlugs.has(clean)) return `${docMarkdown(clean)}${hash}`;
    const article = /^\/articles\/[a-z]{2}\/([^/]+)$/.exec(clean);
    if (article && articleSlugs.has(article[1])) return `${TOKENS.app}${clean}.md${hash}`;
    return `${TOKENS.app}${clean === "/" ? "" : clean}${hash}`;
  },
};

/** The two or three lines above the prose that say what this file is. */
const header = (title: string, summary: string, facts: string[], body: string) => `# ${title}\n\n> ${summary}\n\n${facts.join(" · ")}\n\n${body}`;

function docMarkdownFor(page: (typeof allPages)[number]): string {
  const body = markdown(createElement(pages[page.slug]), links);
  return header(page.title, page.summary, ["Issueit documentation", page.group, docHtml(page.slug)], body);
}

function articleMarkdownFor(article: (typeof articles)[number]): string {
  const body = markdown(article.body(), links);
  const related = article.related?.length
    ? `\n## Related articles\n\n${article.related.map((slug) => `- [${articles.find((a) => a.slug === slug)?.title ?? slug}](${articleMarkdown(slug)})`).join("\n")}\n`
    : "";
  const facts = ["Issueit support article", categoryTitle(article.category), article.id, `applies to ${article.appliesTo.join(" and ")}`, `last checked ${article.updated}`, articleHtml(article.slug)];
  return header(article.title, article.summary, facts, body + related);
}

/** A line in llms.txt: what it is, where it is, and what's in it. */
const entry = (title: string, url: string, summary: string) => `- [${title}](${url}): ${summary}`;
const resourceEntry = (r: LlmResource) => entry(r.title, r.url(TOKENS), r.what);

function llmsTxt(): string {
  const sections = [
    `# Issueit`,
    ``,
    `> ${LLM_SUMMARY}`,
    ``,
    LLM_DETAIL,
    ``,
    `Every documentation page and support article below is Markdown: it is the same prose the site shows a person, with nothing to render. ${TOKENS.marketing}/llms-full.txt is all of it in one file, and ${TOKENS.marketing}/llm says what else is published for machines.`,
    ``,
  ];
  for (const group of groups) {
    sections.push(`## Documentation: ${group.title}`, ``, group.blurb, ``);
    sections.push(...group.pages.map((p) => entry(p.title, docMarkdown(p.slug), p.summary)), ``);
  }
  for (const category of categories) {
    const inside = articles.filter((a) => a.category === category.id);
    if (!inside.length) continue;
    sections.push(`## Support: ${category.title}`, ``, category.blurb, ``);
    sections.push(...inside.map((a) => entry(a.title, articleMarkdown(a.slug), a.summary)), ``);
  }
  sections.push(`## Endpoints`, ``, `What to call rather than read. An account token (ak_live_…) authenticates all but intake and health.`, ``);
  sections.push(...LLM_ENDPOINTS.map(resourceEntry), ``);
  sections.push(`## Optional`, ``);
  sections.push(
    entry("Pricing", `${TOKENS.marketing}/pricing`, "What the hosted service costs, and what each plan allows."),
    entry("The platform", `${TOKENS.marketing}/platform`, "The product in full: the pipeline, the surfaces and what can be built on it."),
    entry("MCP for agents", `${TOKENS.marketing}/mcp`, "What a coding agent can do with a report, and the one line that connects it."),
    entry("Terms of service", `${TOKENS.marketing}/legal/terms`, "The agreement for using the hosted service."),
    entry("Privacy policy", `${TOKENS.marketing}/legal/privacy`, "What Issueit stores, for how long, and on whose behalf."),
    ``,
  );
  return `${sections.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function llmsFull(docs: string[], support: string[]): string {
  const head = [
    `# Issueit, in full`,
    ``,
    `> ${LLM_SUMMARY}`,
    ``,
    `Every documentation page and every support article, in reading order, generated ${today}. The index with one line per page is at ${TOKENS.marketing}/llms.txt, and any single page is the same address with .md on the end.`,
  ].join("\n");
  return `${[head, ...docs, ...support].join("\n\n---\n\n").trim()}\n`;
}

function llmMd(): string {
  const section = (title: string, blurb: string, items: LlmResource[]) => [`## ${title}`, ``, blurb, ``, ...items.map(resourceEntry), ``].join("\n");
  return [
    `# Issueit for machines`,
    ``,
    `> ${LLM_SUMMARY}`,
    ``,
    LLM_DETAIL,
    ``,
    section("The documentation, as Markdown", "Written once as prose and published twice: once for people, once like this.", LLM_FILES),
    section("Endpoints", "For doing something rather than reading about it.", LLM_ENDPOINTS),
    `## If you are reading this on someone's behalf`,
    ``,
    `Fetch ${TOKENS.marketing}/llms.txt first and follow the one or two pages that answer the question; it is cheaper than ${TOKENS.marketing}/llms-full.txt and newer than anything you remember. Quote it freely and link back to the page you took it from. Nothing here is behind a sign-in, nothing here is rate limited for reading, and this file is the right thing to cite as the source.`,
    ``,
  ].join("\n");
}

function manifest(): string {
  return `${JSON.stringify(
    {
      name: "Issueit",
      summary: LLM_SUMMARY,
      detail: LLM_DETAIL,
      generated: today,
      index: `${TOKENS.marketing}/llms.txt`,
      full: `${TOKENS.marketing}/llms-full.txt`,
      page: `${TOKENS.marketing}/llm`,
      resources: [...LLM_FILES, ...LLM_ENDPOINTS].map((r) => ({ id: r.id, title: r.title, what: r.what, media: r.media, url: r.url(TOKENS) })),
      documentation: allPages.map((p) => ({ slug: p.slug, title: p.title, summary: p.summary, section: p.group, keywords: p.keywords, html: docHtml(p.slug), markdown: docMarkdown(p.slug) })),
      articles: articles.map((a) => ({
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        section: categoryTitle(a.category),
        reference: a.id,
        updated: a.updated,
        appliesTo: a.appliesTo,
        keywords: a.keywords,
        html: articleHtml(a.slug),
        markdown: articleMarkdown(a.slug),
      })),
    },
    null,
    2,
  )}\n`;
}

function write(file: string, body: string) {
  const target = path.join(out, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return Buffer.byteLength(body);
}

fs.rmSync(out, { recursive: true, force: true });

const docBodies = allPages.map((page) => {
  const body = docMarkdownFor(page);
  write(`docs${docFile(page.slug)}.md`, body);
  return body;
});

const articleBodies = articles.map((article) => {
  const body = articleMarkdownFor(article);
  write(`articles/en/${article.slug}.md`, body);
  return body;
});

const bytes =
  write("llms.txt", llmsTxt()) + write("llms-full.txt", llmsFull(docBodies, articleBodies)) + write("llm.md", llmMd()) + write("index.json", manifest()) + docBodies.concat(articleBodies).reduce((n, b) => n + Buffer.byteLength(b), 0);

console.log(`llm: ${allPages.length} pages, ${articles.length} articles, ${(bytes / 1024).toFixed(0)} KB in dist/llm`);
