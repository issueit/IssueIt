import { htmlBody, plainBody, titleFor } from "../format";
import { bearer, IntegrationError } from "../http";
import type { Provider, ReportPayload } from "../types";
import { baseUrl, basic, call, define, optional, secret, seg, text, type Spec } from "./define";

/** Help desks and CRMs: each new report opens a ticket, with the reporter as the customer where there is one. */

const fallbackEmail = optional(text("email", "Fallback requester email", "Used when the reporter didn't leave an email address.", "bugs@example.com"));

function requester(report: ReportPayload, fallback: string | undefined, service: string) {
  const email = report.reporter.email ?? fallback;
  if (!email) throw new IntegrationError(`${service} needs a requester email. Add a fallback requester email to the connection, or collect emails in the widget.`, { retryable: false });
  return { email, name: report.reporter.name ?? email.split("@")[0] };
}

/** Freshdesk and Freshservice share an API shape. */
function freshworks(id: string, name: string, domain: string, ticketPath: string): Spec {
  return {
    id,
    name,
    category: "helpdesk",
    keywords: ["freshworks"],
    summary: `Opens a ${name} ticket for each new report.`,
    fields: [text("domain", "Helpdesk address", undefined, `acme.${domain}`), secret("token", "API key", "In your profile settings, under API key."), fallbackEmail],
    async check(creds) {
      const { data } = await call(name, `${baseUrl(creds.domain, "helpdesk address")}/api/v2/agents/me`, { headers: basic(creds.token, "X") });
      return { label: data.contact?.name ?? data.first_name ?? name };
    },
    async send({ report, creds, isTest }) {
      const root = baseUrl(creds.domain, "helpdesk address");
      const who = requester(report, creds.email, name);
      const { data, status } = await call(name, `${root}/api/v2/tickets`, {
        method: "POST",
        headers: basic(creds.token, "X"),
        json: {
          subject: titleFor(report, isTest),
          description: htmlBody(report),
          email: who.email,
          name: who.name,
          priority: { critical: 4, high: 3, medium: 2, low: 1 }[report.priority],
          status: 2,
          tags: ["issueit"],
        },
      });
      const ticket = data.ticket ?? data;
      return { externalId: `#${ticket.id}`, externalUrl: `${root}${ticketPath}${ticket.id}`, responseStatus: status };
    },
  };
}

const specs: Spec[] = [
  {
    id: "zendesk",
    name: "Zendesk",
    category: "helpdesk",
    summary: "Opens a Zendesk ticket for each new report.",
    fields: [
      text("subdomain", "Zendesk address", undefined, "acme.zendesk.com"),
      text("user", "Agent email"),
      secret("token", "API token", "In Admin Center, open Apps and integrations, then Zendesk API."),
    ],
    async check(creds) {
      const { data } = await call("Zendesk", `${baseUrl(creds.subdomain, "Zendesk address")}/api/v2/users/me.json`, { headers: basic(`${creds.user}/token`, creds.token) });
      if (!data.user?.id) throw new IntegrationError("Zendesk rejected the email and token. Check both and try again.", { retryable: false });
      return { label: data.user.name };
    },
    async send({ report, creds, isTest }) {
      const root = baseUrl(creds.subdomain, "Zendesk address");
      const priority = { critical: "urgent", high: "high", medium: "normal", low: "low" }[report.priority];
      const { data, status } = await call("Zendesk", `${root}/api/v2/tickets.json`, {
        method: "POST",
        headers: basic(`${creds.user}/token`, creds.token),
        json: {
          ticket: {
            subject: titleFor(report, isTest),
            comment: { html_body: htmlBody(report) },
            priority,
            type: "problem",
            tags: ["issueit"],
            ...(report.reporter.email ? { requester: { email: report.reporter.email, name: report.reporter.name ?? report.reporter.email } } : {}),
          },
        },
      });
      return { externalId: `#${data.ticket.id}`, externalUrl: `${root}/agent/tickets/${data.ticket.id}`, responseStatus: status };
    },
  },
  freshworks("freshdesk", "Freshdesk", "freshdesk.com", "/a/tickets/"),
  freshworks("freshservice", "Freshservice", "freshservice.com", "/a/tickets/"),
  {
    id: "helpscout",
    name: "Help Scout",
    category: "helpdesk",
    summary: "Starts a Help Scout conversation in a mailbox for each new report.",
    fields: [
      text("clientId", "App ID", "In Help Scout, open Your profile, then My apps, then Create my app."),
      secret("clientSecret", "App secret"),
      text("mailbox", "Mailbox ID", "The number in the mailbox's URL."),
      fallbackEmail,
    ],
    async check(creds) {
      const token = await helpScoutToken(creds.clientId, creds.clientSecret);
      const { data } = await call("Help Scout", "https://api.helpscout.net/v2/users/me", { headers: bearer(token) });
      return { label: [data.firstName, data.lastName].filter(Boolean).join(" ") };
    },
    async send({ report, creds, isTest }) {
      const token = await helpScoutToken(creds.clientId, creds.clientSecret);
      const who = requester(report, creds.email, "Help Scout");
      const { headers, status } = await call("Help Scout", "https://api.helpscout.net/v2/conversations", {
        method: "POST",
        headers: bearer(token),
        json: {
          subject: titleFor(report, isTest),
          customer: { email: who.email },
          mailboxId: Number(creds.mailbox),
          type: "email",
          status: "active",
          tags: ["issueit"],
          threads: [{ type: "customer", customer: { email: who.email }, text: htmlBody(report) }],
        },
        thing: "mailbox",
      });
      const id = headers.get("resource-id");
      return { externalId: id ?? undefined, externalUrl: id ? `https://secure.helpscout.net/conversation/${id}` : undefined, responseStatus: status };
    },
  },
  {
    id: "intercom",
    name: "Intercom",
    category: "helpdesk",
    summary: "Creates an Intercom ticket for each new report.",
    fields: [
      secret("token", "Access token", "From your Intercom app in the Developer Hub."),
      text("ticketType", "Ticket type ID", "In Intercom, open Settings, then Tickets, and copy the type's id."),
      fallbackEmail,
    ],
    async check(creds) {
      const { data } = await call("Intercom", "https://api.intercom.io/me", { headers: { ...bearer(creds.token), "intercom-version": "2.11" } });
      return { label: `${data.name} · ${data.app?.name ?? "Intercom"}` };
    },
    async send({ report, creds, isTest }) {
      const who = requester(report, creds.email, "Intercom");
      const { data, status } = await call("Intercom", "https://api.intercom.io/tickets", {
        method: "POST",
        headers: { ...bearer(creds.token), "intercom-version": "2.11" },
        json: { ticket_type_id: creds.ticketType, contacts: [{ email: who.email }], ticket_attributes: { _default_title_: titleFor(report, isTest), _default_description_: plainBody(report) } },
      });
      return { externalId: data.ticket_id ? `#${data.ticket_id}` : data.id, responseStatus: status };
    },
  },
  {
    id: "front",
    name: "Front",
    category: "helpdesk",
    summary: "Brings each new report into a Front inbox as an incoming message.",
    fields: [secret("token", "API token", "In Front, open Settings, then Developers, then API tokens."), fallbackEmail],
    target: { label: "Channel", fields: [text("channel", "Channel ID", "An API channel's id, e.g. cha_123.", "cha_…")] },
    async check(creds) {
      const { data } = await call("Front", "https://api2.frontapp.com/me", { headers: bearer(creds.token) });
      return { label: data.name ?? "Front" };
    },
    async send({ report, creds, target, isTest }) {
      const who = requester(report, creds.email, "Front");
      const { data, status } = await call("Front", `https://api2.frontapp.com/channels/${seg(target.channel)}/incoming_messages`, {
        method: "POST",
        headers: bearer(creds.token),
        json: { sender: { handle: who.email, name: who.name }, subject: titleFor(report, isTest), body: htmlBody(report), body_format: "html", metadata: { thread_ref: report.id } },
        thing: "channel",
      });
      return { externalId: data.message_uid, responseStatus: status };
    },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "helpdesk",
    keywords: ["service hub", "crm"],
    summary: "Creates a HubSpot ticket for each new report.",
    fields: [secret("token", "Private app token", "A private app with the tickets scope.")],
    help: { text: "Create a private app", url: "https://developers.hubspot.com/docs/api/private-apps" },
    target: {
      label: "Pipeline",
      fields: [optional(text("pipeline", "Pipeline ID", "Leave empty for the default support pipeline.", "0")), optional(text("stage", "Stage ID", "Leave empty for the first stage.", "1"))],
    },
    async check(creds) {
      const { data } = await call("HubSpot", "https://api.hubapi.com/account-info/v3/details", { headers: bearer(creds.token) });
      return { label: `HubSpot account ${data.portalId}` };
    },
    async send({ report, creds, target, isTest }) {
      const priority = report.priority === "critical" || report.priority === "high" ? "HIGH" : report.priority === "medium" ? "MEDIUM" : "LOW";
      const { data, status } = await call("HubSpot", "https://api.hubapi.com/crm/v3/objects/tickets", {
        method: "POST",
        headers: bearer(creds.token),
        json: {
          properties: {
            subject: titleFor(report, isTest),
            content: plainBody(report, 60_000),
            hs_pipeline: target.pipeline || "0",
            hs_pipeline_stage: target.stage || "1",
            hs_ticket_priority: priority,
          },
        },
      });
      return { externalId: `#${data.id}`, responseStatus: status };
    },
  },
  {
    id: "servicenow",
    name: "ServiceNow",
    category: "helpdesk",
    summary: "Raises a ServiceNow incident for each new report.",
    fields: [text("instance", "Instance address", undefined, "acme.service-now.com"), text("user", "User name", "An integration user with the itil role."), secret("password", "Password")],
    async check(creds) {
      await call("ServiceNow", `${baseUrl(creds.instance, "instance address")}/api/now/table/incident?sysparm_limit=1&sysparm_fields=sys_id`, { headers: basic(creds.user, creds.password) });
      return { label: `${creds.user} · ${new URL(baseUrl(creds.instance, "instance address")).host}` };
    },
    async send({ report, creds, isTest }) {
      const root = baseUrl(creds.instance, "instance address");
      const level = { critical: "1", high: "2", medium: "2", low: "3" }[report.priority];
      const { data, status } = await call("ServiceNow", `${root}/api/now/table/incident`, {
        method: "POST",
        headers: basic(creds.user, creds.password),
        json: { short_description: titleFor(report, isTest), description: plainBody(report, 30_000), urgency: level, impact: level, caller_id: report.reporter.email ?? undefined },
      });
      return { externalId: data.result.number, externalUrl: `${root}/nav_to.do?uri=incident.do?sys_id=${data.result.sys_id}`, responseStatus: status };
    },
  },
  {
    id: "gorgias",
    name: "Gorgias",
    category: "helpdesk",
    summary: "Opens a Gorgias ticket for each new report.",
    fields: [text("domain", "Gorgias address", undefined, "acme.gorgias.com"), text("user", "Account email"), secret("token", "API key", "In Gorgias, open Settings, then REST API."), fallbackEmail],
    async send({ report, creds, isTest }) {
      const root = baseUrl(creds.domain, "Gorgias address");
      const who = requester(report, creds.email, "Gorgias");
      const subject = titleFor(report, isTest);
      const { data, status } = await call("Gorgias", `${root}/api/tickets`, {
        method: "POST",
        headers: basic(creds.user, creds.token),
        json: {
          channel: "api",
          via: "api",
          from_agent: false,
          subject,
          customer: { email: who.email, name: who.name },
          tags: [{ name: "issueit" }],
          messages: [{ channel: "api", via: "api", from_agent: false, sender: { email: who.email }, subject, body_text: plainBody(report), body_html: htmlBody(report) }],
        },
      });
      return { externalId: `#${data.id}`, externalUrl: `${root}/app/ticket/${data.id}`, responseStatus: status };
    },
  },
  {
    id: "zammad",
    name: "Zammad",
    category: "helpdesk",
    summary: "Opens a Zammad ticket for each new report.",
    fields: [
      text("url", "Zammad URL", undefined, "https://support.example.com"),
      secret("token", "Access token", "In Zammad, open Profile, then Token access, with ticket.agent permission."),
      fallbackEmail,
    ],
    target: { label: "Group", fields: [optional(text("group", "Group", "Leave empty for Users.", "Users"))] },
    async check(creds) {
      const { data } = await call("Zammad", `${baseUrl(creds.url)}/api/v1/users/me`, { headers: { authorization: `Token token=${creds.token}` } });
      return { label: [data.firstname, data.lastname].filter(Boolean).join(" ") || data.login };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const who = requester(report, creds.email, "Zammad");
      const subject = titleFor(report, isTest);
      const { data, status } = await call("Zammad", `${root}/api/v1/tickets`, {
        method: "POST",
        headers: { authorization: `Token token=${creds.token}` },
        json: {
          title: subject,
          group: target.group || "Users",
          customer_id: `guess:${who.email}`,
          tags: "issueit",
          article: { subject, body: htmlBody(report), content_type: "text/html", type: "note", internal: false },
        },
      });
      return { externalId: `#${data.number}`, externalUrl: `${root}/#ticket/zoom/${data.id}`, responseStatus: status };
    },
  },
  {
    id: "osticket",
    name: "osTicket",
    category: "helpdesk",
    summary: "Opens an osTicket ticket for each new report.",
    fields: [
      text("url", "osTicket URL", undefined, "https://help.example.com"),
      secret("token", "API key", "In osTicket, open Admin panel, then Manage, then API keys. Allow Issueit's address."),
      fallbackEmail,
    ],
    async send({ report, creds, isTest }) {
      const who = requester(report, creds.email, "osTicket");
      const { data, status } = await call("osTicket", `${baseUrl(creds.url)}/api/tickets.json`, {
        method: "POST",
        headers: { "x-api-key": creds.token },
        json: { alert: true, autorespond: false, source: "API", name: who.name, email: who.email, subject: titleFor(report, isTest), message: `data:text/html,${htmlBody(report)}` },
      });
      return { externalId: typeof data === "string" || typeof data === "number" ? `#${data}` : undefined, responseStatus: status };
    },
  },
  {
    id: "attio",
    name: "Attio",
    category: "helpdesk",
    keywords: ["crm"],
    summary: "Creates an Attio task for each new report.",
    fields: [secret("token", "Access token", "In Attio, open Workspace settings, then Developers, with task read-write scope.")],
    async check(creds) {
      const { data } = await call("Attio", "https://api.attio.com/v2/self", { headers: bearer(creds.token) });
      return { label: data.workspace_name ?? "Attio" };
    },
    async send({ report, creds, isTest }) {
      const { data, status } = await call("Attio", "https://api.attio.com/v2/tasks", {
        method: "POST",
        headers: bearer(creds.token),
        json: { data: { content: `${titleFor(report, isTest)}\n\n${plainBody(report, 9000)}`, format: "plaintext", deadline_at: null, is_completed: false, linked_records: [], assignees: [] } },
      });
      return { externalId: data.data?.id?.task_id, responseStatus: status };
    },
  },
];

async function helpScoutToken(clientId: string, clientSecret: string) {
  const { data } = await call("Help Scout", "https://api.helpscout.net/v2/oauth2/token", {
    method: "POST",
    form: { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret },
  });
  return String(data.access_token);
}

export const helpdesks: Provider[] = specs.map(define);
