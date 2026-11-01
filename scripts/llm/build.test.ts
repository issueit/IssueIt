import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { markdownFile } from "../../server/api/llm";

/**
 * The machine-readable documentation is generated from the React pages, which
 * means it can go wrong in a way nobody sees: a new kit component renders to
 * nothing, a page ends up empty, an address keeps its build-time token. This
 * builds it for real and reads the result, because an empty file is still a
 * perfectly valid file.
 */

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "dist/llm");
const read = (file: string) => fs.readFileSync(path.join(out, file), "utf8");
const all = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m[1]);

const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const docSlugs = all(source("web/src/pages/docs/nav.ts"), /\{ slug: "([^"]+)"/g);
const articleSlugs = fs
  .readdirSync(path.join(root, "web/src/pages/support/content"))
  .flatMap((file) => all(source(`web/src/pages/support/content/${file}`), /^ {4}slug: "([^"]+)"/gm));

/** The file a documentation slug is written to. The index is /index.md. */
const docFile = (slug: string) => `docs${slug === "/" ? "/index" : slug}.md`;

beforeAll(() => {
  execFileSync("node", ["scripts/build-llms.mjs"], { cwd: root, stdio: "pipe" });
}, 180_000);

describe("the machine-readable documentation", () => {
  it("writes a file for every page and every article", () => {
    const missing = [...docSlugs.map(docFile), ...articleSlugs.map((slug) => `articles/en/${slug}.md`)].filter((file) => !fs.existsSync(path.join(out, file)));
    expect(missing).toEqual([]);
  });

  it("writes prose rather than an empty shell", () => {
    // Each file opens with a title, a summary and a line of facts; what
    // matters is that the page's own body came through after that.
    const thin = docSlugs.filter((slug) => read(docFile(slug)).split("\n").slice(5).join("\n").trim().length < 500);
    expect(thin, "pages that rendered to almost nothing").toEqual([]);
  });

  it("renders every component to something, rather than dropping it", () => {
    const corpus = read("llms-full.txt");
    expect(corpus).not.toContain("[object Object]");
    expect(corpus).not.toContain("undefined—");
    // A heading, a table, a fenced sample and a list: the kit's four shapes.
    expect(corpus).toMatch(/^## /m);
    expect(corpus).toMatch(/^\| .+ \| .+ \|$/m);
    expect(corpus).toMatch(/^```[a-z]*/m);
    expect(corpus).toMatch(/^- /m);
  });

  it("lists every page in llms.txt, where a reader starts", () => {
    const index = read("llms.txt");
    const listed = [...docSlugs.map((slug) => `${docFile(slug).replace(/^docs/, "")}`), ...articleSlugs.map((slug) => `/articles/en/${slug}.md`)];
    expect(listed.filter((link) => !index.includes(link))).toEqual([]);
  });

  it("leaves addresses as tokens for the server to fill in", () => {
    const tokens = new Set(all(read("llms-full.txt") + read("llms.txt") + read("index.json"), /(__[A-Z_]+__)/g));
    expect([...tokens].sort()).toEqual(["__APP_URL__", "__CDN_URL__", "__DOCS_URL__", "__DROP_URL__", "__MARKETING_URL__"]);
  });

  it("describes itself in the manifest", () => {
    const manifest = JSON.parse(read("index.json")) as { documentation: unknown[]; articles: unknown[]; resources: unknown[] };
    expect(manifest.documentation).toHaveLength(docSlugs.length);
    expect(manifest.articles).toHaveLength(articleSlugs.length);
    expect(manifest.resources.length).toBeGreaterThan(5);
  });
});

describe("serving it", () => {
  const app = createApp();
  const fetchText = async (url: string) => {
    const res = await app.fetch(new Request(`http://localhost${url}`));
    return { res, body: await res.text() };
  };

  it("answers a documentation page at both of its addresses", async () => {
    const app_ = await fetchText("/docs/collect/widget.md");
    const docsHost = await fetchText("/collect/widget.md");
    expect(app_.res.headers.get("content-type")).toContain("text/markdown");
    expect(app_.body).toContain("# The widget");
    expect(docsHost.body).toBe(app_.body);
  });

  it("fills in this install's own addresses", async () => {
    const { body } = await fetchText("/docs/quickstart.md");
    expect(body).not.toMatch(/__[A-Z_]+__/);
    expect(body).toContain("http://localhost:8380");
  });

  it("serves the index, the corpus and the manifest", async () => {
    for (const [url, type] of [
      ["/llms.txt", "text/plain"],
      ["/llms-full.txt", "text/plain"],
      ["/llm/index.json", "application/json"],
      ["/llm.md", "text/markdown"],
    ] as const) {
      const { res, body } = await fetchText(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get("content-type"), url).toContain(type);
      expect(res.headers.get("access-control-allow-origin"), url).toBe("*");
      expect(body.length, url).toBeGreaterThan(200);
    }
  });

  it("sends a reader who guessed wrong to the index", async () => {
    const { res, body } = await fetchText("/docs/no-such-page.md");
    expect(res.status).toBe(404);
    expect(body).toContain("/llms.txt");
  });

  it("leaves everything that isn't a page alone", () => {
    expect(markdownFile("/docs/collect/widget.md")).toBe("docs/collect/widget.md");
    expect(markdownFile("/collect/widget.md")).toBe("docs/collect/widget.md");
    expect(markdownFile("/docs.md")).toBe("docs/index.md");
    expect(markdownFile("/articles/en/add-the-bug-report-button-to-your-website.md")).toBe("articles/en/add-the-bug-report-button-to-your-website.md");
    // Signed attachment links and anything with a traversal in it are not ours.
    expect(markdownFile("/a/att_123/notes.md")).toBeNull();
    expect(markdownFile("/docs/../../etc/passwd.md")).toBeNull();
  });
});
