import { config } from "../config";
import { widgetWithDefaults, type EmailKind, type ProjectEmailSettings } from "../db/schema";
import { escapeHtml, truncate } from "../integrations/format";

type Project = { id: string; name: string; widget: unknown };
type Report = { number: number; title: string; createdAt: Date; groupId: string | null };

export type Brand = { name: string; logoUrl: string | null; accent: string; poweredBy: boolean };

/** The project's widget branding, reused so emails look like the form people used. */
export function brandOf(project: Pick<Project, "name" | "widget">): Brand {
  const w = widgetWithDefaults(project.widget as never);
  return {
    name: w.brandName.trim() || project.name,
    logoUrl: w.logo ? `${config.dropUrl}${w.logo}` : null,
    accent: w.accent ?? "#1c1c1c",
    poweredBy: w.poweredBy,
  };
}

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Paragraphs from a person's own message, with line breaks kept. */
const paragraphs = (text: string) =>
  text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

export type Rendered = { subject: string; html: string; text: string };

/**
 * The receipt and the "it's fixed" note. Only the report's title is shown,
 * never its description: anyone can type any address into a public form,
 * so these emails shouldn't carry much of what a stranger wrote.
 */
export function renderReporterEmail(kind: EmailKind, ctx: { project: Project; report: Report; settings: ProjectEmailSettings; stopUrl: string }): Rendered {
  const brand = brandOf(ctx.project);
  // A stranger may have typed this, so it's kept out of the subject and can't carry a link.
  const title = truncate(
    ctx.report.title
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link]")
      .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:[a-z]{2,24})(?:\/\S*)?\b/gi, "[link]")
      .replace(/\s+/g, " ")
      .trim(),
    120,
  );
  const { settings } = ctx;
  const lines: string[] = [];
  let heading: string;
  let subject: string;
  if (kind === "receipt") {
    subject = `Thanks for your report to ${brand.name}`;
    heading = "Thanks for reporting this";
    lines.push(`The ${brand.name} team has your report and will look into it.`);
    if (ctx.report.groupId) lines.push("Others have reported the same problem, so it's already on the team's list.");
    if (settings.resolved) lines.push("We'll email you when it's fixed.");
  } else {
    subject = `Fixed: the problem you reported to ${brand.name}`;
    heading = "It's fixed";
    lines.push(`The problem you reported to ${brand.name} has been fixed. Thanks for taking the time to tell us about it.`);
  }
  const custom = (kind === "receipt" ? settings.receiptMessage : settings.resolvedMessage).trim();
  const meta = `Report #${ctx.report.number} · sent ${date(ctx.report.createdAt)}`;

  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="28" style="display:block;height:28px;width:auto;max-width:180px;border:0">`
    : `<span style="font-size:15px;font-weight:600;color:#171717">${escapeHtml(brand.name)}</span>`;
  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#171717;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:${escapeHtml(brand.accent)};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 4px">${logo}</td></tr>
<tr><td style="padding:16px 28px 8px;font-size:14px;line-height:1.55;color:#333">
<h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;font-weight:600;color:#171717">${escapeHtml(heading)}</h1>
${lines.map((l) => `<p style="margin:0 0 14px">${escapeHtml(l)}</p>`).join("")}
${custom ? paragraphs(custom) : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;background:#f6f6f6;border-radius:8px"><tr><td style="padding:12px 14px">
<div style="font-size:14px;font-weight:600;color:#171717">${escapeHtml(title)}</div>
<div style="margin-top:3px;font-size:12px;color:#7a7a7a">${escapeHtml(meta)}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #eeeeee;font-size:11.5px;line-height:1.5;color:#7a7a7a">
You're getting this because you reported a problem to ${escapeHtml(brand.name)} and asked for updates. <a href="${escapeHtml(ctx.stopUrl)}" style="color:#7a7a7a">Stop emails about this report</a>.
${brand.poweredBy ? `<br>Sent with <a href="${escapeHtml(config.marketingUrl)}" style="color:#7a7a7a">Issueit</a>.` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    heading,
    "",
    ...lines,
    ...(custom ? ["", custom] : []),
    "",
    `"${title}"`,
    meta,
    "",
    "--",
    `You're getting this because you reported a problem to ${brand.name} and asked for updates.`,
    `Stop emails about this report: ${ctx.stopUrl}`,
  ].join("\n");
  return { subject, html, text };
}
