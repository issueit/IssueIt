import { config } from "../config";
import { widgetWithDefaults, type EmailKind, type ProjectEmailSettings } from "../db/schema";
import { truncate } from "../integrations/format";
import { layout, type Block, type Brand, type FooterLine, type Rendered } from "./shell";

type Project = { id: string; name: string; widget: unknown };
type Report = { number: number; title: string; createdAt: Date; groupId: string | null };

export type { Brand };
export type { Rendered };

/** The project's widget branding, reused so emails look like the form people used. */
export function brandOf(project: Pick<Project, "name" | "widget">): Brand {
  const w = widgetWithDefaults(project.widget as never);
  return {
    name: w.brandName.trim() || project.name,
    logoUrl: w.logo ? `${config.dropUrl}${w.logo}` : null,
    accent: w.accent ?? "#1c1c1c",
  };
}

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** A person's own message, kept as paragraphs. */
const paragraphs = (text: string): Block[] =>
  text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((part) => ({ p: part }));

/**
 * The receipt and the "it's fixed" note: the same shell as Issueit's own
 * email, wearing the project's name, logo and accent instead of Issueit's.
 *
 * Only the report's title is shown, never its description: anyone can type
 * any address into a public form, so these emails shouldn't carry much of
 * what a stranger wrote. The title has links taken out of it for the same
 * reason, and it stays out of the subject line.
 */
export function renderReporterEmail(kind: EmailKind, ctx: { project: Project; report: Report; settings: ProjectEmailSettings; stopUrl: string }): Rendered {
  const brand = brandOf(ctx.project);
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
  let preview: string;
  if (kind === "receipt") {
    subject = `Thanks for your report to ${brand.name}`;
    heading = "Thanks for reporting this";
    preview = `${brand.name} has it, with everything their developers need to find it.`;
    lines.push(`The ${brand.name} team has your report, along with the technical detail that came with it, and will look into it.`);
    if (ctx.report.groupId) lines.push("Others have reported the same problem, so it's already on the team's list.");
    if (settings.resolved) lines.push("We'll email you when it's fixed.");
  } else {
    subject = `Fixed: the problem you reported to ${brand.name}`;
    heading = "It's fixed";
    preview = `The problem you reported to ${brand.name} has been fixed.`;
    lines.push(`The problem you reported to ${brand.name} has been fixed. Thanks for taking the time to tell us about it.`);
  }
  const custom = (kind === "receipt" ? settings.receiptMessage : settings.resolvedMessage).trim();

  const footer: FooterLine[] = [
    {
      text: `You're getting this because you reported a problem to ${brand.name} and asked for updates.`,
      link: { label: "Stop emails about this report", url: ctx.stopUrl },
    },
  ];
  if (widgetWithDefaults(ctx.project.widget as never).poweredBy) {
    footer.push({ text: "Sent with", link: { label: "Issueit", url: config.marketingUrl } });
  }

  return layout({
    brand,
    subject,
    preview,
    heading,
    blocks: [
      ...lines.map((line) => ({ p: line }) as Block),
      ...paragraphs(custom),
      { panel: { title, hint: `Report #${ctx.report.number} · sent ${date(ctx.report.createdAt)}` } },
    ],
    footer,
  });
}
