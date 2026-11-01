/**
 * Fetches the brand marks that Simple Icons doesn't carry and writes them to
 * web/src/components/ui/brandMarks.ts. Run it by hand when the catalogue gains
 * a service: `node scripts/brand-marks.mjs`.
 *
 * Every mark here is the service's own logo, taken from a public icon set or
 * the service's own site, flattened to one colour so it sits next to the
 * Simple Icons marks without shouting. Logos stay the property of their
 * owners; we draw them only to name the service they belong to.
 *
 * Where a product has no mark of its own we use the company that runs it
 * (Backlog gets Nulab's, Amazon's queues get the AWS mark) rather than invent
 * one. Services with neither fall through to the glyphs in BrandIcon.
 */
import { writeFile } from "node:fs/promises";

/**
 * Keyed by mark, not by provider: BrandIcon decides which services wear which,
 * so the AWS mark is fetched once and worn by every Amazon queue.
 *
 * source: iconify `prefix:name`, `si13:slug` (a Simple Icons release that
 * still carried the mark), or an https URL to the logo itself.
 */
const sources = {
  // Trackers and project tools
  monday: { title: "monday.com", source: "iconify:logos:monday-icon" },
  youtrack: { title: "YouTrack", source: "iconify:logos:youtrack" },
  azuredevops: { title: "Azure DevOps", source: "iconify:cib:azure-devops" },
  teamwork: { title: "Teamwork", source: "iconify:logos:teamwork-icon" },
  productboard: { title: "Productboard", source: "iconify:logos:productboard-icon" },
  taiga: { title: "Taiga", source: "iconify:logos:taiga" },
  nulab: { title: "Nulab", source: "https://nulab.com/favicon.svg" },
  kanboard: { title: "Kanboard", source: "iconify:thesvg-color:kanboard" },

  // Help desks and CRM
  servicenow: { title: "ServiceNow", source: "iconify:thesvg-color:servicenow" },
  zammad: { title: "Zammad", source: "iconify:selfhst:zammad" },
  osticket: { title: "osTicket", source: "iconify:thesvg-color:osticket" },
  attio: { title: "Attio", source: "iconify:thesvg-color:attio" },
  front: { title: "Front", source: "https://svgl.app/library/front.svg" },

  // Spreadsheets and databases
  smartsheet: { title: "Smartsheet", source: "https://smartsheet.com/favicon.svg" },
  nocodb: { title: "NocoDB", source: "iconify:logos:nocodb" },
  grist: { title: "Grist", source: "iconify:selfhst:grist" },

  // Chat
  slack: { title: "Slack", source: "si13:slack" },
  teams: { title: "Microsoft Teams", source: "iconify:bxl:microsoft-teams" },
  dingtalk: { title: "DingTalk", source: "iconify:mingcute:dingtalk-fill" },
  wecom: { title: "WeCom", source: "iconify:tdesign:logo-wecom-filled" },
  flock: { title: "Flock", source: "https://www.flock.com/hubfs/Flock%20Icon.svg" },
  twist: { title: "Twist", source: "https://static.twist.com/favicon-safari-64db82.svg" },
  pumble: { title: "Pumble", source: "https://pumble.com/assets/images/favicons/safari-pinned-tab.svg" },

  // Push, SMS and email
  pushover: { title: "Pushover", source: "iconify:selfhst:pushover" },
  apprise: { title: "Apprise", source: "iconify:selfhst:apprise" },
  twilio: { title: "Twilio", source: "si13:twilio" },
  plivo: { title: "Plivo", source: "https://plivo.com/favicon/favicon.svg" },
  sendgrid: { title: "SendGrid", source: "si13:sendgrid" },
  mailjet: { title: "Mailjet", source: "iconify:logos:mailjet-icon" },
  postmark: { title: "Postmark", source: "iconify:thesvg-color:postmark" },
  ses: { title: "Amazon SES", source: "si13:amazonsimpleemailservice" },

  // On-call
  incidentio: { title: "incident.io", source: "iconify:logos:incident-icon" },

  // Automation
  powerautomate: { title: "Power Automate", source: "iconify:selfhst:microsoft-power-automate" },
  inngest: { title: "Inngest", source: "https://www.inngest.com/favicon-june-2025-dark.svg" },
  activepieces: { title: "Activepieces", source: "iconify:thesvg-color:activepieces" },
  tray: { title: "Tray", source: "https://tray.ai/favicon.svg" },

  // Analytics
  segment: { title: "Segment", source: "iconify:logos:segment-icon" },
  amplitude: { title: "Amplitude", source: "iconify:logos:amplitude-icon" },

  // Cloud queues and events
  aws: { title: "Amazon Web Services", source: "si13:amazonwebservices" },
  sqs: { title: "Amazon SQS", source: "si13:amazonsqs" },
  azure: { title: "Microsoft Azure", source: "iconify:mdi:microsoft-azure" },
};

/** The Simple Icons release that still carried marks since withdrawn from it. */
const SI_RELEASE = "13.21.0";

const KEEP_EL = new Set(["path", "circle", "ellipse", "rect", "polygon", "polyline", "line"]);
const KEEP_ATTR = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "points", "x1", "y1", "x2", "y2", "fill-rule", "clip-rule", "transform"]);

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "issueit-brand-marks" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.text();
}

/** Returns { viewBox, body } for one source, before any cleaning. */
async function fetchMark(source) {
  if (source.startsWith("si13:")) {
    const svg = await get(`https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@${SI_RELEASE}/icons/${source.slice(5)}.svg`);
    return { viewBox: "0 0 24 24", body: svg.match(/<path[^>]*\sd="([^"]+)"/)[0] + "</path>" };
  }
  if (source.startsWith("iconify:")) {
    const [prefix, name] = source.slice(8).split(":");
    const set = JSON.parse(await get(`https://api.iconify.design/${prefix}.json?icons=${name}`));
    const icon = set.icons[name];
    const w = icon.width ?? set.width ?? 24;
    const h = icon.height ?? set.height ?? 24;
    return { viewBox: `0 0 ${w} ${h}`, body: icon.body };
  }
  const svg = await get(source);
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  return { viewBox, body: svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>[\s\S]*$/, "") };
}

/** Drawing elements only, with their attributes, in document order. */
function elements(body) {
  const stripped = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<defs[\s\S]*?<\/defs>/gi, "")
    .replace(/<(title|desc|metadata)[\s\S]*?<\/\1>/gi, "");
  const out = [];
  for (const m of stripped.matchAll(/<([a-zA-Z0-9]+)((?:\s+[^>]*?)?)\/?>/g)) {
    const el = m[1].toLowerCase();
    if (!KEEP_EL.has(el)) continue;
    const attrs = {};
    for (const a of m[2].matchAll(/([a-zA-Z0-9:_-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1].toLowerCase()] = a[2];
    out.push({ el, attrs });
  }
  return out;
}

/**
 * How much of the viewBox a shape covers, roughly: enough to spot the rounded
 * tile that app icons sit on, which has to go before the glyph can be drawn in
 * one colour. Path extents come from a plain scan of the numbers in `d`, which
 * flatters curves a little and is fine for a tile.
 */
function coverage({ el, attrs }, viewBox) {
  const [, , w, h] = viewBox.split(/\s+/).map(Number);
  const num = (v) => Number(v ?? 0);
  if (el === "rect") return [num(attrs.width) / w, num(attrs.height) / h];
  if (el === "circle") return [(2 * num(attrs.r)) / w, (2 * num(attrs.r)) / h];
  if (el === "ellipse") return [(2 * num(attrs.rx)) / w, (2 * num(attrs.ry)) / h];
  if (el === "path") {
    const nums = (attrs.d ?? "").match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
    if (!nums.length) return [0, 0];
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    return [(Math.max(...xs) - Math.min(...xs)) / w, (Math.max(...ys) - Math.min(...ys)) / h];
  }
  return [0, 0];
}

function clean({ viewBox, body }) {
  let els = elements(body);
  if (els.length > 1) {
    const [first] = els;
    const [cw, ch] = coverage(first, viewBox);
    const subpaths = (first.attrs.d?.match(/[Mm]/g) ?? []).length;
    if (cw > 0.85 && ch > 0.85 && (first.el !== "path" || subpaths <= 1)) els = els.slice(1);
  }
  return els
    .map(({ el, attrs }) => {
      const kept = Object.entries(attrs)
        .filter(([k]) => KEEP_ATTR.has(k))
        .map(([k, v]) => `${k}="${v.replace(/\s+/g, " ").trim()}"`);
      return `<${el} ${kept.join(" ")}/>`;
    })
    .join("");
}

const entries = [];
for (const [mark, { title, source }] of Object.entries(sources)) {
  const raw = await fetchMark(source);
  if (/<(g|use|mask|clipPath|image|text)[\s>]/i.test(raw.body.replace(/<g[^>]*>/gi, (m) => (/transform|clip-path/i.test(m) ? m : "")))) {
    console.warn(`${mark}: source uses markup this script drops — check how it draws`);
  }
  const body = clean(raw);
  if (!body) throw new Error(`${mark}: nothing left to draw from ${source}`);
  entries.push({ mark, title, source, viewBox: raw.viewBox, body });
  console.log(`${mark.padEnd(14)} ${String(body.length).padStart(5)} chars  ${source}`);
}

const file = `// Generated by scripts/brand-marks.mjs — edit that, not this.
//
// Brand marks for services Simple Icons doesn't carry, flattened to a single
// colour. Each logo belongs to the company it names; it appears here only to
// identify the service Issueit delivers to.

export type BrandMark = { title: string; viewBox: string; body: string };

export const brandMarks = {
${entries.map((e) => `  // ${e.source}\n  ${e.mark}: { title: ${JSON.stringify(e.title)}, viewBox: ${JSON.stringify(e.viewBox)}, body: ${JSON.stringify(e.body)} },`).join("\n")}
} satisfies Record<string, BrandMark>;
`;

await writeFile(new URL("../web/src/components/ui/brandMarks.ts", import.meta.url), file);
console.log(`\n${entries.length} marks, ${(file.length / 1024).toFixed(1)} KB`);
