import { smtpHost, smtpSend, smtpVerify } from "../../mail/smtp";
import { recipients, subject } from "../catalogue/notify";
import { htmlBody, plainBody } from "../format";
import { IntegrationError } from "../http";
import type { Provider } from "../types";

/** Any mail server that speaks SMTP: Gmail, Microsoft 365, Fastmail, your own Postfix. */
export const smtp: Provider = {
  id: "smtp",
  name: "SMTP",
  kind: "chat",
  category: "email",
  keywords: ["email", "mail server", "gmail", "outlook", "microsoft 365", "fastmail", "postfix"],
  summary: "Emails each new report through your own mail server.",
  targetLabel: "Recipients",
  targetFields: [{ key: "to", label: "Send to", hint: "One or more addresses, separated by commas.", placeholder: "dev@example.com" }],
  events: ["report.created"],
  tokenFields: [
    {
      key: "url",
      label: "Server",
      secret: true,
      placeholder: "smtps://user:password@smtp.example.com:465",
      hint: "smtps:// for TLS on port 465, smtp:// for STARTTLS on 587. Encode @ in the password as %40.",
    },
    { key: "from", label: "From address", hint: "A sender the server lets you use.", placeholder: "Bugs <bugs@example.com>" },
  ],
  async connectWithToken(fields) {
    const url = fields.url?.trim();
    const from = fields.from?.trim();
    if (!url || !from) throw new IntegrationError("Enter the server and the from address.", { retryable: false });
    await smtpVerify(url);
    return { credentials: { url, from }, account: { label: `SMTP · ${smtpHost(url)}` } };
  },
  async validate(conn) {
    await smtpVerify(String(conn.credentials.url));
    return conn.account;
  },
  async deliver({ report, target, connection, isTest }) {
    const creds = connection!.credentials;
    const { id } = await smtpSend(String(creds.url), {
      from: String(creds.from),
      to: recipients(String(target.to ?? "")),
      subject: subject(report, isTest),
      html: htmlBody(report),
      text: plainBody(report, 20_000),
    });
    return { externalId: id };
  },
};
