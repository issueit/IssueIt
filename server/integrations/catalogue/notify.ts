import { htmlBody, plainBody, shortLine, titleFor, truncate } from "../format";
import { bearer, IntegrationError } from "../http";
import type { Provider, ReportPayload } from "../types";
import { baseUrl, basic, call, define, optional, secret, seg, text, type Spec } from "./define";
import { awsRequest } from "./signing";

/** Push notifications, SMS and email. */

const sms = (r: ReportPayload, isTest: boolean) => truncate(`${shortLine(r, isTest)}\n${r.dashboardUrl}`, 320);

/** Comma-separated addresses, checked loosely, at most twenty. */
export function recipients(raw: string): string[] {
  const list = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!list.length || list.some((a) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a))) throw new IntegrationError("Check the recipient addresses. Separate them with commas.", { retryable: false });
  return list;
}

const from = text("from", "From address", "A sender your account is allowed to use.", "Issueit <bugs@example.com>");
const to = { label: "Recipients", fields: [text("to", "Send to", "One or more addresses, separated by commas.", "dev@example.com")] };
export const subject = (r: ReportPayload, isTest: boolean) => `[${r.project.name}] ${shortLine(r, isTest)}`;
export const emailOf = (address: string) => /<([^>]+)>/.exec(address)?.[1] ?? address;
export const nameOf = (address: string) => /^\s*"?([^"<]+?)"?\s*</.exec(address)?.[1];

const specs: Spec[] = [
  /* ---------------------------------------------------------------- push */
  {
    id: "pushover",
    name: "Pushover",
    category: "notify",
    summary: "Sends a push notification through Pushover for each new report.",
    fields: [secret("token", "Application token", "Create an application on pushover.net."), secret("user", "User or group key")],
    async check(creds) {
      await call("Pushover", "https://api.pushover.net/1/users/validate.json", { method: "POST", form: { token: creds.token, user: creds.user } });
      return { label: "Pushover" };
    },
    async send({ report, creds, isTest }) {
      const priority = { critical: "1", high: "0", medium: "0", low: "-1" }[report.priority];
      const { data, status } = await call("Pushover", "https://api.pushover.net/1/messages.json", {
        method: "POST",
        form: {
          token: creds.token,
          user: creds.user,
          title: truncate(titleFor(report, isTest), 250),
          message: plainBody(report, 1000),
          url: report.dashboardUrl,
          url_title: "View in Issueit",
          priority,
        },
      });
      return { externalId: data.request, responseStatus: status };
    },
  },
  {
    id: "pushbullet",
    name: "Pushbullet",
    category: "notify",
    summary: "Pushes each new report to your Pushbullet devices or a channel.",
    fields: [secret("token", "Access token", "In Pushbullet, open Settings, then Account.")],
    target: { label: "Channel", fields: [optional(text("channel", "Channel tag", "Leave empty to push to your own devices."))] },
    async check(creds) {
      const { data } = await call("Pushbullet", "https://api.pushbullet.com/v2/users/me", { headers: { "access-token": creds.token } });
      return { label: data.name ?? data.email };
    },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Pushbullet", "https://api.pushbullet.com/v2/pushes", {
        method: "POST",
        headers: { "access-token": creds.token },
        json: { type: "link", title: titleFor(report, isTest), body: plainBody(report, 2000), url: report.dashboardUrl, ...(target.channel ? { channel_tag: target.channel } : {}) },
      });
      return { externalId: data.iden, responseStatus: status };
    },
  },
  {
    id: "ntfy",
    name: "ntfy",
    category: "notify",
    summary: "Publishes each new report to an ntfy topic.",
    fields: [optional(text("url", "Server URL", "Leave empty for ntfy.sh.", "https://ntfy.sh")), optional(secret("token", "Access token", "Only for protected topics."))],
    target: { label: "Topic", fields: [text("topic", "Topic", "Anyone who knows a public topic name can read it, so pick something hard to guess.")] },
    async send({ report, creds, target, isTest }) {
      const priority = { critical: 5, high: 4, medium: 3, low: 2 }[report.priority];
      const { data, status } = await call("ntfy", baseUrl(creds.url || "https://ntfy.sh"), {
        method: "POST",
        headers: creds.token ? bearer(creds.token) : {},
        json: { topic: target.topic, title: titleFor(report, isTest), message: plainBody(report, 3500), priority, tags: ["bug"], click: report.dashboardUrl, markdown: false },
        thing: "topic",
      });
      return { externalId: data?.id, responseStatus: status };
    },
  },
  {
    id: "gotify",
    name: "Gotify",
    category: "notify",
    summary: "Sends each new report to your Gotify server.",
    fields: [text("url", "Gotify URL", undefined, "https://gotify.example.com"), secret("token", "Application token")],
    async send({ report, creds, isTest }) {
      const priority = { critical: 9, high: 7, medium: 5, low: 2 }[report.priority];
      const { data, status } = await call("Gotify", `${baseUrl(creds.url)}/message?token=${seg(creds.token)}`, {
        method: "POST",
        json: {
          title: titleFor(report, isTest),
          message: plainBody(report, 3500),
          priority,
          extras: { "client::display": { contentType: "text/plain" }, "client::notification": { click: { url: report.dashboardUrl } } },
        },
      });
      return { externalId: String(data.id ?? ""), responseStatus: status };
    },
  },
  {
    id: "bark",
    name: "Bark",
    category: "notify",
    keywords: ["ios push"],
    summary: "Sends each new report to an iPhone through Bark.",
    fields: [optional(text("url", "Server URL", "Leave empty for api.day.app.", "https://api.day.app")), secret("key", "Device key")],
    async send({ report, creds, isTest }) {
      const { status } = await call("Bark", `${baseUrl(creds.url || "https://api.day.app")}/push`, {
        method: "POST",
        json: {
          device_key: creds.key,
          title: titleFor(report, isTest),
          body: plainBody(report, 1500),
          url: report.dashboardUrl,
          group: "Issueit",
          level: report.priority === "critical" ? "timeSensitive" : "active",
        },
      });
      return { responseStatus: status };
    },
  },
  {
    id: "apprise",
    name: "Apprise",
    category: "notify",
    summary: "Sends each new report through an Apprise API server to any service it supports.",
    fields: [text("url", "Apprise API URL", undefined, "https://apprise.example.com"), text("key", "Configuration key", "The key you saved your notification URLs under.")],
    async send({ report, creds, isTest }) {
      const type = report.priority === "critical" ? "failure" : report.priority === "high" ? "warning" : "info";
      const { status } = await call("Apprise", `${baseUrl(creds.url)}/notify/${seg(creds.key)}`, {
        method: "POST",
        json: { title: titleFor(report, isTest), body: plainBody(report), type, format: "text" },
      });
      return { responseStatus: status };
    },
  },

  /* ---------------------------------------------------------------- SMS */
  {
    id: "twilio",
    name: "Twilio SMS",
    category: "notify",
    keywords: ["sms", "text message", "twilio"],
    summary: "Texts each new report's title and link through Twilio. Best kept to critical reports.",
    fields: [text("sid", "Account SID", undefined, "AC…"), secret("token", "Auth token"), text("from", "From number", "A Twilio number or messaging service SID.", "+447700900123")],
    target: { label: "Recipient", fields: [text("to", "Send to", "A phone number in international format.", "+447700900456")] },
    async check(creds) {
      const { data } = await call("Twilio", `https://api.twilio.com/2010-04-01/Accounts/${seg(creds.sid)}.json`, { headers: basic(creds.sid, creds.token) });
      return { label: data.friendly_name };
    },
    async send({ report, creds, target, isTest }) {
      const sender: Record<string, string> = creds.from.startsWith("MG") ? { MessagingServiceSid: creds.from } : { From: creds.from };
      const { data, status } = await call("Twilio", `https://api.twilio.com/2010-04-01/Accounts/${seg(creds.sid)}/Messages.json`, {
        method: "POST",
        headers: basic(creds.sid, creds.token),
        form: { To: target.to, Body: sms(report, isTest), ...sender },
      });
      return { externalId: data.sid, responseStatus: status };
    },
  },
  {
    id: "vonage",
    name: "Vonage SMS",
    category: "notify",
    keywords: ["sms", "nexmo"],
    summary: "Texts each new report's title and link through Vonage.",
    fields: [text("key", "API key"), secret("secret", "API secret"), text("from", "Sender", "A Vonage number or alphanumeric sender id.", "Issueit")],
    target: { label: "Recipient", fields: [text("to", "Send to", "A phone number in international format, without the +.", "447700900456")] },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Vonage", "https://rest.nexmo.com/sms/json", {
        method: "POST",
        form: { api_key: creds.key, api_secret: creds.secret, from: creds.from, to: target.to.replace(/^\+/, ""), text: sms(report, isTest) },
      });
      const message = data.messages?.[0];
      if (message && message.status !== "0")
        throw new IntegrationError(`Vonage didn't send the text. Vonage said: "${String(message["error-text"] ?? message.status).slice(0, 200)}".`, { retryable: message.status === "1" });
      return { externalId: message?.["message-id"], responseStatus: status };
    },
  },
  {
    id: "plivo",
    name: "Plivo SMS",
    category: "notify",
    keywords: ["sms"],
    summary: "Texts each new report's title and link through Plivo.",
    fields: [text("id", "Auth ID"), secret("token", "Auth token"), text("from", "From number", undefined, "+14155550123")],
    target: { label: "Recipient", fields: [text("to", "Send to", undefined, "+14155550456")] },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Plivo", `https://api.plivo.com/v1/Account/${seg(creds.id)}/Message/`, {
        method: "POST",
        headers: basic(creds.id, creds.token),
        json: { src: creds.from, dst: target.to, text: sms(report, isTest) },
      });
      return { externalId: data.message_uuid?.[0], responseStatus: status };
    },
  },

  /* ---------------------------------------------------------------- email */
  ...emailSpecs(),
];

/* ------------------------------------------------------------------ email services */

/** One email, in the shape every service below can send. */
export type MailMessage = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** Services that support it drop a second send with the same key. */
  idempotencyKey?: string;
};

export type Mailer = (creds: Record<string, string>, msg: MailMessage) => Promise<{ id?: string; status: number }>;

const headerList = (h: Record<string, string> = {}) => Object.entries(h).map(([Name, Value]) => ({ Name, Value }));

/**
 * The email services, by provider id. Reports to developers and emails to
 * reporters both go through these, so each service is written once.
 */
export const mailers: Record<string, Mailer> = {
  async resend(creds, m) {
    const { data, status } = await call("Resend", "https://api.resend.com/emails", {
      method: "POST",
      headers: { ...bearer(creds.token), ...(m.idempotencyKey ? { "idempotency-key": m.idempotencyKey } : {}) },
      json: { from: m.from, to: m.to, subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}) },
    });
    return { id: data.id, status };
  },
  async postmark(creds, m) {
    const { data, status } = await call("Postmark", "https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "x-postmark-server-token": creds.token },
      json: {
        From: m.from,
        To: m.to.join(","),
        Subject: m.subject,
        HtmlBody: m.html,
        TextBody: m.text,
        ...(m.replyTo ? { ReplyTo: m.replyTo } : {}),
        ...(m.headers ? { Headers: headerList(m.headers) } : {}),
        Tag: "issueit",
        MessageStream: "outbound",
      },
    });
    if (data.ErrorCode) throw new IntegrationError(`Postmark didn't send the email. Postmark said: "${String(data.Message).slice(0, 200)}".`, { retryable: false });
    return { id: data.MessageID, status };
  },
  async sendgrid(creds, m) {
    const { headers, status } = await call("SendGrid", "https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: bearer(creds.token),
      json: {
        personalizations: [{ to: m.to.map((email) => ({ email })) }],
        from: { email: emailOf(m.from), name: nameOf(m.from) },
        ...(m.replyTo ? { reply_to: { email: emailOf(m.replyTo) } } : {}),
        subject: m.subject,
        content: [
          { type: "text/plain", value: m.text },
          { type: "text/html", value: m.html },
        ],
        ...(m.headers ? { headers: m.headers } : {}),
        categories: ["issueit"],
      },
    });
    return { id: headers.get("x-message-id") ?? undefined, status };
  },
  async mailgun(creds, m) {
    const extra: Record<string, string> = {};
    if (m.replyTo) extra["h:Reply-To"] = m.replyTo;
    for (const [k, v] of Object.entries(m.headers ?? {})) extra[`h:${k}`] = v;
    const { data, status } = await call("Mailgun", `https://${creds.host || "api.mailgun.net"}/v3/${seg(creds.domain)}/messages`, {
      method: "POST",
      headers: basic("api", creds.token),
      form: { from: m.from, to: m.to.join(","), subject: m.subject, text: m.text, html: m.html, "o:tag": "issueit", ...extra },
    });
    return { id: data.id, status };
  },
  async brevo(creds, m) {
    const { data, status } = await call("Brevo", "https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": creds.token },
      json: {
        sender: { email: emailOf(m.from), name: nameOf(m.from) },
        to: m.to.map((email) => ({ email })),
        ...(m.replyTo ? { replyTo: { email: emailOf(m.replyTo) } } : {}),
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
        ...(m.headers ? { headers: m.headers } : {}),
        tags: ["issueit"],
      },
    });
    return { id: data.messageId, status };
  },
  async mailjet(creds, m) {
    const { data, status } = await call("Mailjet", "https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: basic(creds.key, creds.secret),
      json: {
        Messages: [
          {
            From: { Email: emailOf(m.from), Name: nameOf(m.from) },
            To: m.to.map((Email) => ({ Email })),
            ...(m.replyTo ? { ReplyTo: { Email: emailOf(m.replyTo) } } : {}),
            Subject: m.subject,
            TextPart: m.text,
            HTMLPart: m.html,
            ...(m.headers ? { Headers: m.headers } : {}),
            CustomCampaign: "issueit",
          },
        ],
      },
    });
    const message = data.Messages?.[0];
    if (message?.Status === "error")
      throw new IntegrationError(`Mailjet didn't send the email. Mailjet said: "${String(message.Errors?.[0]?.ErrorMessage ?? "unknown error").slice(0, 200)}".`, { retryable: false });
    return { id: String(message?.To?.[0]?.MessageID ?? ""), status };
  },
  async sparkpost(creds, m) {
    const { data, status } = await call("SparkPost", `https://${creds.host || "api.sparkpost.com"}/api/v1/transmissions`, {
      method: "POST",
      headers: { authorization: creds.token },
      json: {
        recipients: m.to.map((address) => ({ address })),
        content: { from: m.from, subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}) },
        metadata: { source: "issueit" },
      },
    });
    return { id: data.results?.id, status };
  },
  async ses(creds, m) {
    const body = JSON.stringify({
      FromEmailAddress: m.from,
      Destination: { ToAddresses: m.to },
      ...(m.replyTo ? { ReplyToAddresses: [m.replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: m.subject },
          Body: { Text: { Data: m.text }, Html: { Data: m.html } },
          ...(m.headers ? { Headers: headerList(m.headers) } : {}),
        },
      },
    });
    const { data, status } = await awsRequest({
      service: "ses",
      name: "Amazon SES",
      region: creds.region,
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      host: `email.${creds.region}.amazonaws.com`,
      path: "/v2/email/outbound-emails",
      headers: { "content-type": "application/json" },
      body,
    });
    return { id: data.MessageId, status };
  },
};

/** Each mailer as a destination that emails new reports to the team. */
function emailSpecs(): Spec[] {
  const services: Array<Omit<Spec, "category" | "target" | "send" | "summary"> & { label: string }> = [
    { id: "resend", name: "Resend", label: "Resend", keywords: ["email"], fields: [secret("token", "API key", undefined, "re_…"), from] },
    { id: "postmark", name: "Postmark", label: "Postmark", keywords: ["email"], fields: [secret("token", "Server API token"), from] },
    { id: "sendgrid", name: "SendGrid", label: "SendGrid", keywords: ["email", "twilio sendgrid"], fields: [secret("token", "API key", "With Mail Send access.", "SG.…"), from] },
    {
      id: "mailgun",
      name: "Mailgun",
      label: "Mailgun",
      keywords: ["email"],
      fields: [secret("token", "API key"), text("domain", "Sending domain", undefined, "mg.example.com"), from, optional(text("host", "API host", "api.eu.mailgun.net for EU domains.", "api.mailgun.net"))],
    },
    {
      id: "brevo",
      name: "Brevo",
      label: "Brevo",
      keywords: ["email", "sendinblue"],
      fields: [secret("token", "API key"), from],
      async check(creds) {
        const { data } = await call("Brevo", "https://api.brevo.com/v3/account", { headers: { "api-key": creds.token } });
        return { label: data.email ?? data.companyName };
      },
    },
    { id: "mailjet", name: "Mailjet", label: "Mailjet", keywords: ["email"], fields: [text("key", "API key"), secret("secret", "Secret key"), from] },
    {
      id: "sparkpost",
      name: "SparkPost",
      label: "SparkPost",
      keywords: ["email", "bird"],
      fields: [secret("token", "API key", "With Transmissions read and write."), from, optional(text("host", "API host", "api.eu.sparkpost.com for EU accounts.", "api.sparkpost.com"))],
    },
    {
      id: "ses",
      name: "Amazon SES",
      label: "Amazon Simple Email Service",
      keywords: ["email", "aws"],
      fields: [text("accessKeyId", "Access key ID", "An IAM user allowed ses:SendEmail.", "AKIA…"), secret("secretAccessKey", "Secret access key"), text("region", "Region", undefined, "eu-west-2"), from],
    },
  ];
  return services.map(({ label, ...s }) => ({
    ...s,
    category: "email" as const,
    summary: `Emails each new report through ${label}.`,
    target: to,
    async send({ report, creds, target, isTest, deliveryId }) {
      const { id, status } = await mailers[s.id](creds, {
        from: creds.from,
        to: recipients(target.to),
        subject: subject(report, isTest),
        html: htmlBody(report),
        text: plainBody(report, 20_000),
        idempotencyKey: `issueit-${deliveryId}`,
      });
      return { externalId: id, responseStatus: status };
    },
  }));
}

export const notifiers: Provider[] = specs.map(define);
