import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router";
import * as doc from "../../web/src/pages/docs/kit";
import * as kb from "../../web/src/pages/support/kit";
import { DocsLink } from "../../web/src/lib/docs-link";
import { BrandIcon } from "../../web/src/components/ui/BrandIcon";

/**
 * Documentation pages and support articles, as Markdown.
 *
 * The prose is written once, as React, and read by people in a browser. This
 * renders the very same components to Markdown for everything that isn't a
 * browser — a model asked to set Issueit up, an agent following a stack
 * trace, a crawler building an index. Walking the element tree rather than
 * the rendered HTML means the kit's own shapes survive the trip: a table is
 * a table, a callout is a quote, and a code sample keeps its language.
 *
 * Components are matched by identity, so a new one in either kit shows up
 * here as missing output rather than as HTML leaking into the Markdown.
 */

/** Turns an address as it appears in the prose into one a reader outside the site can follow. */
export type Links = { to: (path: string) => string };

type Props = Record<string, any>;
type Handler = (props: Props, links: Links) => string;

export function markdown(node: ReactNode, links: Links): string {
  return tidy(render(node, links));
}

function tidy(text: string): string {
  return `${text
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function render(node: ReactNode, l: Links): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  // Literal JSX text carries the source file's line breaks and indentation.
  if (typeof node === "string") return node.replace(/\s+/g, " ");
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child, l)).join("");
  if (!isValidElement(node)) return "";

  const el = node as ReactElement<Props>;
  const type = el.type as unknown;
  if (typeof type === "string") return host(type, el.props, l);

  // A fragment, which is how every page and every article opens.
  if (type === Fragment) return render(el.props.children, l);

  const known = components.get(type);
  if (known) return known(el.props, l);

  // Anything else written as a plain function — a wrapper in a content file —
  // is called and walked. It can't be a hook-using component: the only hooks
  // in this prose fetch data, and those are stubbed for the render.
  if (typeof type === "function") return render((type as (p: Props) => ReactNode)(el.props), l);
  return "";
}

/** The same, but on one line: table cells, link text, headings. */
function inline(node: ReactNode, l: Links): string {
  return render(node, l)
    .replace(/\s*\n\s*/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

const block = (text: string) => (text.trim() ? `\n\n${text.trim()}\n\n` : "");
const wrap = (text: string, mark: string) => (text ? `${mark}${text}${mark}` : "");
const link = (label: string, href: string) => (href ? (label ? `[${label}](${href})` : `<${href}>`) : label);
const quote = (text: string) => text.trim().split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n");
const indent = (text: string, pad: string) =>
  text
    .split("\n")
    .map((line) => (line ? pad + line : ""))
    .join("\n");

function fence(code: string, lang = "", title?: string): string {
  const bars = "`".repeat(Math.max(3, longestRun(code) + 1));
  return `${bars}${lang}${title ? ` title="${title}"` : ""}\n${code}\n${bars}`;
}

/** A sample that itself contains backticks still has to come out as one block. */
function longestRun(code: string): number {
  return [...code.matchAll(/`+/g)].reduce((most, m) => Math.max(most, m[0].length), 0);
}

function host(tag: string, props: Props, l: Links): string {
  const children = () => render(props.children, l);
  switch (tag) {
    case "p":
      return block(children());
    case "strong":
    case "b":
      return wrap(inline(props.children, l), "**");
    case "em":
    case "i":
      return wrap(inline(props.children, l), "_");
    case "code":
      return wrap(inline(props.children, l), "`");
    case "pre":
      return block(fence(inline(props.children, l)));
    case "a":
      return link(inline(props.children, l), l.to(String(props.href ?? "")));
    case "br":
      return "\n";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
      return block(`${"#".repeat(Number(tag[1]))} ${inline(props.children, l)}`);
    case "ul":
      return block(list(props.children, l, () => "- "));
    case "ol":
      return block(list(props.children, l, (i) => `${i + 1}. `));
    case "hr":
      return block("---");
    // Marks, controls and the icons beside them say nothing in Markdown.
    case "svg":
    case "path":
    case "circle":
    case "rect":
    case "img":
    case "button":
    case "input":
      return "";
    case "div":
      return props.className === "dp-catalogue" ? block(catalogue(props, l)) : children();
    default:
      return children();
  }
}

function list(children: ReactNode, l: Links, marker: (index: number) => string): string {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((item, i) => {
      const mark = marker(i);
      const body = render((item as ReactElement<Props>).props.children, l).trim();
      return mark + indent(body, " ".repeat(mark.length)).trimStart();
    })
    .join("\n");
}

/* --------------------------------------------------------- the documentation kit */

const calloutLabels: Record<string, string> = { note: "Note", warning: "Warning", tip: "Tip" };
const noteLabels: Record<string, string> = { note: "Note", important: "Important", tip: "Tip" };

/** The language of a code tab, for the fence. Labels name a language or a tool. */
const languages: Record<string, string> = {
  "cURL": "bash",
  Shell: "bash",
  Terminal: "bash",
  Bash: "bash",
  Node: "js",
  "Node.js": "js",
  JavaScript: "js",
  TypeScript: "ts",
  React: "tsx",
  Python: "python",
  Go: "go",
  PHP: "php",
  Ruby: "ruby",
  Java: "java",
  Rust: "rust",
  Swift: "swift",
  Kotlin: "kotlin",
  "C#": "csharp",
  HTML: "html",
  JSON: "json",
  YAML: "yaml",
  SQL: "sql",
};

/** A tab labelled for a client rather than a language still has a language. */
function guessLanguage(code: string): string {
  const start = code.trim();
  if (start.startsWith("{") || start.startsWith("[")) return "json";
  if (start.startsWith("<")) return "html";
  if (/^(npx|npm|curl|docker|issueit|claude|git|export|\$|#)/.test(start)) return "bash";
  return "";
}

function params(props: Props, l: Links): string {
  return props.rows
    .map((row: Props) => {
      const notes = [row.type, row.required ? "required" : null].filter(Boolean).join(", ");
      return `- \`${row.name}\`${notes ? ` (${notes})` : ""} — ${inline(row.children, l)}`;
    })
    .join("\n");
}

function table(props: Props, l: Links): string {
  const cell = (node: ReactNode) => inline(node, l).replace(/\|/g, "\\|") || " ";
  const head = `| ${props.head.map((h: string) => cell(h)).join(" | ")} |`;
  const rule = `| ${props.head.map(() => "---").join(" | ")} |`;
  const rows = props.rows.map((row: ReactNode[]) => `| ${row.map(cell).join(" | ")} |`);
  return [head, rule, ...rows].join("\n");
}

/** Numbered work. The documentation's steps carry a title; a support article's don't. */
function steps(children: ReactNode, l: Links): string {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((step, i) => {
      const props = (step as ReactElement<Props>).props;
      const mark = `${i + 1}. `;
      const title = props.title ? `**${props.title}**` : "";
      const body = render(props.children, l).trim();
      const text = title && body ? `${title}\n\n${body}` : title || body;
      return mark + indent(text, " ".repeat(mark.length)).trimStart();
    })
    .join("\n\n");
}

/** The live list of destinations, as names rather than a wall of logos. */
function catalogue(props: Props, l: Links): string {
  return Children.toArray(props.children)
    .filter(isValidElement)
    .map((section) => {
      const [heading, names] = Children.toArray((section as ReactElement<Props>).props.children).filter(isValidElement) as Array<ReactElement<Props>>;
      const label = inline(Children.toArray(heading.props.children)[0], l);
      const list = Children.toArray(names.props.children)
        .filter(isValidElement)
        .map((name) => inline((name as ReactElement<Props>).props.children, l))
        .filter(Boolean);
      return `- **${label}** (${list.length}): ${list.join(", ")}`;
    })
    .join("\n");
}

const components = new Map<unknown, Handler>([
  /* The documentation's kit. */
  [doc.H2, (p, l) => block(`## ${inline(p.children, l)}`)],
  [doc.H3, (p, l) => block(`### ${inline(p.children, l)}`)],
  [doc.C, (p, l) => wrap(inline(p.children, l), "`")],
  [doc.D, (p, l) => link(inline(p.children, l), l.to(p.to))],
  [doc.Code, (p) => block(fence(p.code, p.lang ?? "", p.title))],
  [doc.CodeTabs, (p) => block(p.tabs.map((tab: Props) => fence(tab.code, languages[tab.label] ?? guessLanguage(tab.code), tab.label)).join("\n\n"))],
  [doc.Endpoint, (p) => block([fence(`${p.method} ${p.path}`, "http"), p.auth ? `**Auth:** ${p.auth}` : ""].filter(Boolean).join("\n\n"))],
  [doc.Params, (p, l) => block(params(p, l))],
  [doc.Table, (p, l) => block(table(p, l))],
  [doc.Callout, (p, l) => block(quote(`**${p.title ?? calloutLabels[p.kind ?? "note"]}**\n\n${render(p.children, l).trim()}`))],
  [doc.Steps, (p, l) => block(steps(p.children, l))],
  [doc.Cards, (p, l) => block(p.items.map((item: Props) => `- ${link(item.title, l.to(item.to))} — ${item.text}`).join("\n"))],
  [doc.Facts, (p, l) => block(p.rows.map(([key, value]: [ReactNode, ReactNode]) => `- **${inline(key, l)}** — ${inline(value, l)}`).join("\n"))],

  /* The support articles' kit. */
  [kb.H2, (p, l) => block(`## ${inline(p.children, l)}`)],
  [kb.H3, (p, l) => block(`### ${inline(p.children, l)}`)],
  [kb.C, (p, l) => wrap(inline(p.children, l), "`")],
  [kb.UI, (p, l) => wrap(inline(p.children, l), "**")],
  [kb.Doc, (p, l) => link(inline(p.children, l), l.to(p.to))],
  [kb.Code, (p) => block(fence(p.code, "", p.title))],
  [kb.Table, (p, l) => block(table(p, l))],
  [kb.Note, (p, l) => block(quote(`**${noteLabels[p.kind ?? "note"]}**\n\n${render(p.children, l).trim()}`))],
  [kb.Steps, (p, l) => block(steps(p.children, l))],
  [kb.More, (p, l) => block(`**${p.title}**\n\n${render(p.children, l).trim()}`)],
  [kb.Symptom, (p, l) => render(p.children, l)],

  /* Links out of the prose, and the marks that carry no words. */
  [DocsLink, (p, l) => link(inline(p.children, l), l.to(p.to ?? "/"))],
  [Link, (p, l) => link(inline(p.children, l), l.to(String(p.to ?? "")))],
  [BrandIcon, () => ""],
]);
