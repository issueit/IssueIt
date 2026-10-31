import { config } from "../config";
import { IntegrationError } from "../integrations/http";
import { smtpSend } from "./smtp";

/**
 * Email from Issueit itself: a reset link, an invitation, a report someone
 * asked to hear about, the digest, the one note from a person. Always through
 * the install's own mail server, because these are from Issueit and not from
 * a customer's brand — which is the whole difference from `outbox.ts`.
 *
 * What they look like is in `shell.ts`; what they say is in `copy.ts`.
 */

export const systemMailAvailable = () => !!config.smtp.url;

export type { Block, Brand, FooterLine, Rendered } from "./shell";
export { ISSUEIT, layout } from "./shell";

export type SystemMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Overrides SMTP_FROM, for the note that comes from a person. */
  from?: string;
  replyTo?: string;
};

/** Sends now. Throws an IntegrationError, so callers can say whether to retry. */
export async function sendSystemMail(msg: SystemMail): Promise<{ id?: string }> {
  if (!config.smtp.url) {
    throw new IntegrationError("This server has no mail server set up, so Issueit can't send email. Set SMTP_URL.", { retryable: false });
  }
  return smtpSend(
    config.smtp.url,
    { from: msg.from || config.smtp.from, to: [msg.to], replyTo: msg.replyTo, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers },
    { trusted: true },
  );
}
