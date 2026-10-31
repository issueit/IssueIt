import { config } from "../config";
import { escapeHtml } from "../integrations/format";
import { IntegrationError } from "../integrations/http";
import { smtpSend } from "./smtp";

/**
 * Email from Issueit itself: a reset link, an invitation, a report someone
 * asked to hear about, the digest. Always through the install's own SMTP
 * server, because these are from Issueit and not from a customer's brand —
 * which is the whole difference from `outbox.ts`.
 */

export const systemMailAvailable = () => !!config.smtp.url;

export type Rendered = { subject: string; html: string; text: string };

export type Block =
  /** A paragraph. */
  | { p: string }
  /** The one thing to click. */
  | { button: { label: string; url: string } }
  /** Label and value pairs, in a quiet box. */
  | { facts: ReadonlyArray<readonly [string, string]> }
  /** A list of reports or similar, each optionally a link. */
  | { list: ReadonlyArray<{ title: string; hint?: string; url?: string }> }
  /** Small print under the rule. */
  | { note: string };

const BG = "#f4f4f4";
const INK = "#171717";
const QUIET = "#7a7a7a";
const ACCENT = "#1c1c1c";

/**
 * One layout for every system email: a narrow card, no images, no web fonts,
 * and tables rather than flexbox, because half of these are read in Outlook.
 */
export function layout(input: { subject: string; heading: string; blocks: readonly Block[]; footer?: string }): Rendered {
  const parts: string[] = [];
  const plain: string[] = [input.heading, ""];
  for (const block of input.blocks) {
    if ("p" in block) {
      parts.push(`<p style="margin:0 0 14px">${escapeHtml(block.p)}</p>`);
      plain.push(block.p, "");
    } else if ("button" in block) {
      parts.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td style="border-radius:8px;background:${ACCENT}">` +
          `<a href="${escapeHtml(block.button.url)}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(block.button.label)}</a>` +
          `</td></tr></table>`,
      );
      plain.push(`${block.button.label}: ${block.button.url}`, "");
    } else if ("facts" in block) {
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 18px;background:#f6f6f6;border-radius:8px"><tr><td style="padding:12px 14px;font-size:13px;line-height:1.6;color:${INK}">` +
          block.facts.map(([k, v]) => `<div><span style="color:${QUIET}">${escapeHtml(k)}:</span> ${escapeHtml(v)}</div>`).join("") +
          `</td></tr></table>`,
      );
      for (const [k, v] of block.facts) plain.push(`${k}: ${v}`);
      plain.push("");
    } else if ("list" in block) {
      parts.push(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 18px">` +
          block.list
            .map(
              (item) =>
                `<tr><td style="padding:9px 0;border-top:1px solid #eeeeee;font-size:14px;line-height:1.45">` +
                (item.url
                  ? `<a href="${escapeHtml(item.url)}" style="color:${INK};font-weight:600;text-decoration:none">${escapeHtml(item.title)}</a>`
                  : `<span style="color:${INK};font-weight:600">${escapeHtml(item.title)}</span>`) +
                (item.hint ? `<div style="margin-top:2px;font-size:12px;color:${QUIET}">${escapeHtml(item.hint)}</div>` : "") +
                `</td></tr>`,
            )
            .join("") +
          `</table>`,
      );
      for (const item of block.list) plain.push(`- ${item.title}${item.hint ? ` (${item.hint})` : ""}${item.url ? `\n  ${item.url}` : ""}`);
      plain.push("");
    } else {
      parts.push(`<p style="margin:0 0 10px;font-size:12.5px;color:${QUIET}">${escapeHtml(block.note)}</p>`);
      plain.push(block.note, "");
    }
  }

  const footer = input.footer ?? `Sent by Issueit · ${config.appUrl}`;
  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${INK};-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e3e3;border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:${ACCENT};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 0;font-size:15px;font-weight:600;color:${INK}">Issueit</td></tr>
<tr><td style="padding:14px 28px 6px;font-size:14px;line-height:1.55;color:#333">
<h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;font-weight:600;color:${INK}">${escapeHtml(input.heading)}</h1>
${parts.join("\n")}
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid #eeeeee;font-size:11.5px;line-height:1.5;color:${QUIET}">${escapeHtml(footer)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: input.subject, html, text: [...plain, "--", footer].join("\n").replace(/\n{3,}/g, "\n\n") };
}

/** Sends now. Throws an IntegrationError, so callers can say whether to retry. */
export async function sendSystemMail(msg: { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }): Promise<{ id?: string }> {
  if (!config.smtp.url) {
    throw new IntegrationError("This server has no mail server set up, so Issueit can't send email. Set SMTP_URL.", { retryable: false });
  }
  return smtpSend(config.smtp.url, { from: config.smtp.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers }, { trusted: true });
}
