import { escapeHtml } from "../integrations/format";

/**
 * One shell for every email Issueit sends, product mail and reporter mail
 * alike, so an "it's fixed" note from a customer's brand is the same object
 * as a password reset with a different name on it.
 *
 * The rules it keeps to, because email clients are not browsers:
 * tables for layout, every style inline, no web fonts, no images in the
 * chrome — Issueit's mark is a rounded cell with a serif I in it, so it
 * survives blocked images — and a light-mode design that a `<style>` block
 * flips for dark mode where the client honours one. Nothing here depends on
 * the database, so every template can be rendered in a preview or a test.
 */

export type Brand = {
  /** The name in the lockup and the footer. */
  name: string;
  /** A tenant's own logo. Issueit draws its mark instead, so it leaves this out. */
  logoUrl?: string | null;
  /** The hairline above the card and the colour of the one button. */
  accent: string;
  /** Issueit's own mail, which may draw the mark and speak in the first person. */
  own?: boolean;
};

export const ISSUEIT: Brand = { name: "Issueit", accent: "#171717", own: true };

export type Block =
  /** A paragraph. */
  | { p: string }
  /** The one thing to click. `plain` also prints the URL, for the emails people forward to themselves. */
  | { button: { label: string; url: string; plain?: boolean } }
  /** Label and value pairs, one per hairline row. */
  | { facts: ReadonlyArray<readonly [string, string]> }
  /** What the email is about, quoted in a quiet box. */
  | { panel: { title: string; hint?: string } }
  /** Reports or similar, each optionally a link. */
  | { list: ReadonlyArray<{ title: string; hint?: string; url?: string }> }
  /** Numbered things to do. */
  | { steps: ReadonlyArray<{ title: string; hint?: string }> }
  /** Small print, under the last paragraph. */
  | { note: string }
  /** Signed by a person rather than a product. */
  | { signature: { name: string; line?: string } };

export type FooterLine = { text: string; link?: { label: string; url: string } };

export type Rendered = { subject: string; html: string; text: string };

export type LayoutInput = {
  subject: string;
  /** The line inboxes show after the subject. Worth writing: without it they show the first words of the HTML. */
  preview?: string;
  /** A quiet label above the heading: the project, the organisation, what kind of email this is. */
  eyebrow?: string;
  heading: string;
  blocks: readonly Block[];
  footer?: readonly FooterLine[];
  brand?: Brand;
  /** No lockup, no card: the shell for a note from a person. */
  bare?: boolean;
};

/* ------------------------------------------------------------------ tokens */

// Single quotes only: this goes inside double-quoted style attributes.
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif`;
const T = {
  page: "#f4f4f5",
  card: "#ffffff",
  panel: "#fafafa",
  line: "#ebebeb",
  ink: "#171717",
  body: "#44444a",
  quiet: "#8a8a90",
};

/** Dark enough to need white text on it? Tenants choose any accent they like. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.42 ? "#171717" : "#ffffff";
}

/**
 * Dark mode, for the clients that say which one they're in. Classes only:
 * the inline styles above are the light design, and these override them.
 */
const DARK_CSS = `
@media (prefers-color-scheme: dark) {
  .page { background: #0c0c0d !important; }
  .card { background: #151517 !important; border-color: #262628 !important; }
  .panel { background: #1b1b1e !important; border-color: #2a2a2d !important; }
  .ink, .ink a { color: #f3f3f4 !important; }
  .body { color: #c2c2c7 !important; }
  .quiet, .quiet a { color: #8f8f96 !important; }
  .hair { border-color: #262628 !important; }
  .band { background: #0f0f11 !important; }
  .own-btn { background: #f3f3f4 !important; }
  .own-btn a { color: #111113 !important; }
  .num { background: #26262a !important; color: #f3f3f4 !important; }
}`;

/* ------------------------------------------------------------------ pieces */

/** Single newlines are kept, so a tenant's own wording arrives the way they typed it. */
const p = (text: string) => `<p class="body" style="margin:0 0 15px;font-size:15px;line-height:1.62;color:${T.body}">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;

/**
 * Issueit's own mail wears a dark masthead: the mark reversed out, the
 * wordmark, and what the email is about on the right. Nothing else Issueit
 * sends looks like this, which is the point — a reporter getting an "it's
 * fixed" note from a shop should never wonder who Issueit is.
 */
function masthead(eyebrow?: string): string {
  return `<tr><td class="band" style="background:${T.ink};padding:15px 30px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" style="vertical-align:middle">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="markrev" width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;background:#f3f3f4;border-radius:8px;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:700;line-height:26px;color:${T.ink};text-align:center">I</td>
<td style="padding-left:10px;font-family:${FONT};font-size:15px;font-weight:600;letter-spacing:-0.012em;color:#ffffff">Issueit</td>
</tr></table>
</td>
${eyebrow ? `<td align="right" style="vertical-align:middle;font-family:${FONT};font-size:10.5px;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;color:#9a9aa2">${escapeHtml(eyebrow)}</td>` : ""}
</tr></table>
</td></tr>`;
}

/**
 * A tenant's email is a plain white letter instead: their hairline, their
 * logo, and no Issueit anywhere above the footer.
 */
function tenantHeader(brand: Brand): string {
  const inside = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="28" style="display:block;height:28px;width:auto;max-width:190px;border:0">`
    : `<span class="ink" style="font-family:${FONT};font-size:16px;font-weight:600;letter-spacing:-0.012em;color:${T.ink}">${escapeHtml(brand.name)}</span>`;
  return `<tr><td style="height:3px;background:${escapeHtml(brand.accent)};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td class="pad hair" style="padding:26px 32px 20px;border-bottom:1px solid ${T.line}">${inside}</td></tr>`;
}

function button(brand: Brand, b: { label: string; url: string; plain?: boolean }): string {
  const fg = brand.own ? "#ffffff" : readableOn(brand.accent);
  const cls = brand.own ? "own-btn" : "";
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 ${b.plain ? 10 : 22}px"><tr>` +
    `<td class="${cls}" align="center" style="background:${escapeHtml(brand.accent)};border-radius:10px">` +
    `<a href="${escapeHtml(b.url)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:14.5px;font-weight:600;line-height:1;color:${fg};text-decoration:none">${escapeHtml(b.label)}</a>` +
    `</td></tr></table>` +
    (b.plain
      ? `<p class="quiet" style="margin:0 0 20px;font-size:12.5px;line-height:1.5;color:${T.quiet};word-break:break-all">Or paste this into your browser:<br>${escapeHtml(b.url)}</p>`
      : "")
  );
}

function facts(rows: ReadonlyArray<readonly [string, string]>): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 20px">` +
    rows
      .map(
        ([k, v], i) =>
          `<tr><td class="hair" style="padding:11px 0;border-top:1px solid ${T.line};${i === rows.length - 1 ? `border-bottom:1px solid ${T.line};` : ""}">` +
          `<div class="quiet" style="font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:${T.quiet}">${escapeHtml(k)}</div>` +
          `<div class="ink" style="margin-top:4px;font-size:14.5px;line-height:1.45;color:${T.ink};word-break:break-word">${escapeHtml(v)}</div>` +
          `</td></tr>`,
      )
      .join("") +
    `</table>`
  );
}

const panel = (x: { title: string; hint?: string }) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="panel" style="margin:4px 0 20px;background:${T.panel};border:1px solid ${T.line};border-radius:10px"><tr><td style="padding:15px 17px">` +
  `<div class="ink" style="font-size:15px;font-weight:600;line-height:1.4;color:${T.ink}">${escapeHtml(x.title)}</div>` +
  (x.hint ? `<div class="quiet" style="margin-top:5px;font-size:12.5px;line-height:1.45;color:${T.quiet}">${escapeHtml(x.hint)}</div>` : "") +
  `</td></tr></table>`;

function list(items: ReadonlyArray<{ title: string; hint?: string; url?: string }>): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 20px">` +
    items
      .map(
        (item, i) =>
          `<tr><td class="hair" style="padding:11px 0;border-top:1px solid ${T.line};${i === items.length - 1 ? `border-bottom:1px solid ${T.line};` : ""}">` +
          (item.url
            ? `<a class="ink" href="${escapeHtml(item.url)}" style="font-size:14.5px;font-weight:600;line-height:1.4;color:${T.ink};text-decoration:none">${escapeHtml(item.title)}</a>`
            : `<span class="ink" style="font-size:14.5px;font-weight:600;line-height:1.4;color:${T.ink}">${escapeHtml(item.title)}</span>`) +
          (item.hint ? `<div class="quiet" style="margin-top:4px;font-size:12.5px;line-height:1.45;color:${T.quiet}">${escapeHtml(item.hint)}</div>` : "") +
          `</td></tr>`,
      )
      .join("") +
    `</table>`
  );
}

function steps(items: ReadonlyArray<{ title: string; hint?: string }>): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 18px">` +
    items
      .map(
        (item, i) =>
          `<tr><td width="34" valign="top" style="width:34px;padding:0 0 15px">` +
          `<div class="num" style="width:23px;height:23px;background:#f0f0f1;border-radius:999px;font-size:12px;font-weight:600;line-height:23px;color:${T.ink};text-align:center">${i + 1}</div>` +
          `</td><td valign="top" style="padding:0 0 15px">` +
          `<div class="ink" style="font-size:14.5px;font-weight:600;line-height:1.4;color:${T.ink}">${escapeHtml(item.title)}</div>` +
          (item.hint ? `<div class="body" style="margin-top:3px;font-size:13.5px;line-height:1.5;color:${T.body}">${escapeHtml(item.hint)}</div>` : "") +
          `</td></tr>`,
      )
      .join("") +
    `</table>`
  );
}

const signature = (s: { name: string; line?: string }) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px"><tr><td>` +
  `<div class="ink" style="font-size:15px;font-weight:600;color:${T.ink}">${escapeHtml(s.name)}</div>` +
  (s.line ? `<div class="quiet" style="margin-top:3px;font-size:13px;line-height:1.45;color:${T.quiet}">${escapeHtml(s.line)}</div>` : "") +
  `</td></tr></table>`;

/* ------------------------------------------------------------------ layout */

function renderBlocks(brand: Brand, blocks: readonly Block[]): { html: string; text: string[] } {
  const html: string[] = [];
  const text: string[] = [];
  for (const block of blocks) {
    if ("p" in block) {
      html.push(p(block.p));
      text.push(block.p, "");
    } else if ("button" in block) {
      html.push(button(brand, block.button));
      text.push(`${block.button.label}: ${block.button.url}`, "");
    } else if ("facts" in block) {
      html.push(facts(block.facts));
      for (const [k, v] of block.facts) text.push(`${k}: ${v}`);
      text.push("");
    } else if ("panel" in block) {
      html.push(panel(block.panel));
      text.push(`"${block.panel.title}"`, ...(block.panel.hint ? [block.panel.hint] : []), "");
    } else if ("list" in block) {
      html.push(list(block.list));
      for (const item of block.list) text.push(`- ${item.title}${item.hint ? ` (${item.hint})` : ""}${item.url ? `\n  ${item.url}` : ""}`);
      text.push("");
    } else if ("steps" in block) {
      html.push(steps(block.steps));
      block.steps.forEach((s, i) => text.push(`${i + 1}. ${s.title}${s.hint ? ` — ${s.hint}` : ""}`));
      text.push("");
    } else if ("note" in block) {
      html.push(`<p class="quiet" style="margin:0 0 12px;font-size:12.5px;line-height:1.55;color:${T.quiet}">${escapeHtml(block.note)}</p>`);
      text.push(block.note, "");
    } else {
      html.push(signature(block.signature));
      text.push("", block.signature.name, ...(block.signature.line ? [block.signature.line] : []), "");
    }
  }
  return { html: html.join("\n"), text };
}

function footerHtml(lines: readonly FooterLine[]): string {
  return lines
    .map(
      (line) =>
        `<div style="margin:0 0 4px">${escapeHtml(line.text)}${
          line.link ? `${line.text ? " " : ""}<a href="${escapeHtml(line.link.url)}" style="color:${T.quiet};text-decoration:underline">${escapeHtml(line.link.label)}</a>` : ""
        }</div>`,
    )
    .join("");
}

/** The whole email: subject, HTML and the plain text that goes with it. */
export function layout(input: LayoutInput): Rendered {
  const brand = input.brand ?? ISSUEIT;
  const { html: body, text: plain } = renderBlocks(brand, input.blocks);
  const footer = input.footer ?? [];
  const preview = input.preview ?? "";

  const head = input.bare ? "" : brand.own ? masthead(input.eyebrow) : tenantHeader(brand);
  // Issueit's own mail says what it is in the masthead, so the body doesn't repeat it.
  const eyebrow = brand.own && !input.bare ? undefined : input.eyebrow;

  const html = `<!doctype html>
<html lang="en-GB" style="color-scheme:light dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.subject)}</title>
<style>${DARK_CSS}
@media (max-width:620px) { .pad { padding-left:22px !important; padding-right:22px !important } }
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${T.page};font-family:${FONT};color:${T.ink};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(preview)}</div>
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.page}"><tr><td align="center" style="padding:40px 14px">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${T.card};border:1px solid ${T.line};border-radius:14px;overflow:hidden">
${head}
<tr><td class="pad" style="padding:${input.bare ? "34px 32px 6px" : brand.own ? "26px 32px 6px" : "24px 32px 6px"}">
${eyebrow ? `<div class="quiet" style="margin:0 0 9px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${T.quiet}">${escapeHtml(eyebrow)}</div>` : ""}
${input.heading ? `<h1 class="ink" style="margin:0 0 14px;font-size:21px;line-height:1.28;font-weight:600;letter-spacing:-0.018em;color:${T.ink}">${escapeHtml(input.heading)}</h1>` : ""}
${body}
</td></tr>
${
  footer.length
    ? `<tr><td class="pad hair quiet" style="padding:20px 32px 26px;border-top:1px solid ${T.line};font-size:12px;line-height:1.55;color:${T.quiet}">${footerHtml(footer)}</td></tr>`
    : ""
}
</table>
</td></tr></table>
</body></html>`;

  const text = [
    input.heading,
    "",
    ...plain,
    ...(footer.length ? ["--", ...footer.map((l) => [l.text, l.link ? l.link.url : ""].filter(Boolean).join(" "))] : []),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { subject: input.subject, html, text };
}
