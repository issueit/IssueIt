import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The documentation and the support articles are two lists each: what the
 * index says exists, and what is actually written. These read the source as
 * text rather than importing it, so the check costs nothing and doesn't drag
 * a browser's worth of modules into the test run.
 *
 * It fails when a page is listed but unwritten, written but unlisted, or
 * linked to by a slug that doesn't exist — which is how prose rots.
 */

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const all = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m[1]);

const navSource = read("pages/docs/nav.ts");
const docSlugs = all(navSource, /\{ slug: "([^"]+)"/g);
const docBodies = fs
  .readdirSync(path.join(root, "pages/docs/content"))
  .flatMap((file) => all(read(`pages/docs/content/${file}`), /^ {2}"(\/[^"]*)":/gm));

const articleFiles = fs.readdirSync(path.join(root, "pages/support/content"));
const articleSources = articleFiles.map((file) => read(`pages/support/content/${file}`));
const articleSlugs = articleSources.flatMap((text) => all(text, /^ {4}slug: "([^"]+)"/gm));

describe("the documentation", () => {
  it("has a body for every page in the nav, and no orphans", () => {
    expect([...docSlugs].sort()).toEqual([...docBodies].sort());
  });

  it("lists every page exactly once", () => {
    expect(new Set(docSlugs).size).toBe(docSlugs.length);
  });

  it("sends every legacy anchor somewhere that exists", () => {
    const targets = all(navSource, /^ {2}[\w"'-]+: "(\/[^"]*)",$/gm);
    expect(targets.length).toBeGreaterThan(10);
    for (const target of targets) expect(docSlugs, `legacy anchor to ${target}`).toContain(target);
  });

  it("only links to pages that exist", () => {
    for (const file of fs.readdirSync(path.join(root, "pages/docs/content"))) {
      const text = read(`pages/docs/content/${file}`);
      for (const to of all(text, /<(?:D|Cards[\s\S]*?) to="([^"]+)"/g)) {
        expect(docSlugs, `${file} links to ${to}`).toContain(to);
      }
      for (const to of all(text, /\{ to: "([^"]+)"/g)) {
        expect(docSlugs, `${file} links to ${to}`).toContain(to);
      }
    }
  });
});

describe("the support articles", () => {
  it("gives every article a unique slug and article number", () => {
    const ids = articleSources.flatMap((text) => all(text, /^ {4}id: "([^"]+)"/gm));
    expect(new Set(articleSlugs).size).toBe(articleSlugs.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(articleSlugs.length);
  });

  it("only relates articles that exist", () => {
    for (const text of articleSources) {
      for (const list of all(text, /^ {4}related: \[([^\]]*)\]/gm)) {
        for (const slug of all(list, /"([^"]+)"/g)) expect(articleSlugs, `related: ${slug}`).toContain(slug);
      }
    }
  });

  it("only links into documentation pages that exist", () => {
    for (const text of [...articleSources, read("pages/support/Support.tsx"), read("pages/site/pages/Platform.tsx")]) {
      for (const to of all(text, /<Doc(?:sLink)? to="([^"]+)"/g)) expect(docSlugs, `link to ${to}`).toContain(to);
      for (const to of all(text, /\bto: "(\/[^"]*)"/g)) {
        if (to.startsWith("/collect") || to.startsWith("/deliver") || to.startsWith("/reports") || to.startsWith("/automate") || to.startsWith("/reference") || to.startsWith("/self-host")) {
          expect(docSlugs, `link to ${to}`).toContain(to);
        }
      }
    }
  });

  it("is reachable from the support home page", () => {
    const home = read("pages/support/articles.ts");
    for (const slug of all(home, /^ {2}"([a-z-]+)",$/gm)) expect(articleSlugs, `popular: ${slug}`).toContain(slug);
  });
});
