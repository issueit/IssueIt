import { eq } from "drizzle-orm";
import { config } from "../config";
import { db, schema } from "../db";
import { widgetWithDefaults } from "../db/schema";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/**
 * The hosted report form at /r/{project_id}. It is the widget drawn inline,
 * so the two can never drift apart.
 */
export async function hostedFormPage(projectId: string): Promise<{ status: number; html: string }> {
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project || !project.publicSubmissions) {
    return { status: 404, html: shell("Form not found", `<p class="lead">This report form doesn't exist or has been turned off.</p>`, { accent: null, poweredBy: true }) };
  }
  const w = widgetWithDefaults(project.widget);
  const name = escapeHtml(w.brandName.trim() || project.name);
  const logo = w.logo ? `<img class="logo" src="${escapeHtml(config.dropUrl + w.logo)}" alt="${name}">` : "";
  const body = `
    ${logo}
    <p class="eyebrow">${escapeHtml(w.title)}</p>
    <h1>${name}</h1>
    <p class="lead">Tell the team what went wrong. You don't need an account.</p>
    <div id="issueit-form"></div>
    <script src="${config.cdnUrl}/widget.js" data-project="${escapeHtml(project.id)}" data-mode="inline" data-target="#issueit-form" data-source="form" data-capture="off" defer></script>`;
  return { status: 200, html: shell(`${escapeHtml(w.title)} - ${name}`, body, { accent: w.accent, poweredBy: w.poweredBy }) };
}

/** The page behind "Stop emails about this report". */
export function stopEmailsPage(state: "ask" | "done" | "invalid", action = "") {
  const body =
    state === "ask"
      ? `<h1>Stop emails about this report?</h1><p class="lead">You won't hear any more about this report, including when it's fixed.</p>
         <form method="post" action="${escapeHtml(action)}"><button type="submit">Stop emails</button></form>`
      : state === "done"
        ? `<h1>Emails stopped</h1><p class="lead">You won't get any more emails about this report.</p>`
        : `<h1>This link doesn't work</h1><p class="lead">It may have been copied incompletely. Use the link in the email you received.</p>`;
  return shell("Email preferences", body, { accent: null, poweredBy: true });
}

function shell(title: string, body: string, brand: { accent: string | null; poweredBy: boolean }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light dark; --bg: #f6f6f6; --text: #171717; --text-2: #555; --text-3: #7a7a7a; --border: #e3e3e3; --surface: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111; --text: #ededed; --text-2: #a9a9a9; --text-3: #808080; --border: #282828; --surface: #161616; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 13.5px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 520px; margin: 0 auto; padding: 56px 20px 40px; }
  .eyebrow { margin: 0 0 4px; font-size: 11.5px; color: var(--text-3); }
  h1 { margin: 0 0 6px; font-size: 21px; font-weight: 600; }
  .lead { margin: 0 0 20px; color: var(--text-2); }
  #issueit-form { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
  footer { margin-top: 16px; font-size: 11.5px; color: var(--text-3); text-align: center; }
  footer a { color: inherit; }
  .logo { display: block; height: 32px; width: auto; max-width: 200px; margin: 0 0 18px; object-fit: contain; }
  button { font: inherit; font-weight: 550; height: 34px; padding: 0 14px; border: 0; border-radius: 6px; cursor: pointer; background: ${brand.accent ?? "var(--text)"}; color: ${brand.accent ? contrast(brand.accent) : "var(--bg)"}; }
</style>
</head>
<body>
<main>
${body}
${brand.poweredBy && !body.includes('id="issueit-form"') ? `<footer>Collected by <a href="${config.marketingUrl}" rel="noopener">Issueit</a></footer>` : ""}
</main>
</body>
</html>`;
}

/** Black or white text, whichever reads better on the accent. Matches the widget. */
function contrast(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}
