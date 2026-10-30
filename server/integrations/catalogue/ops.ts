import { eventEnvelope } from "../../delivery/payload";
import { facts, plainBody, priorityLabel, titleFor, truncate } from "../format";
import { bearer, IntegrationError } from "../http";
import type { Provider, ReportPayload } from "../types";
import { baseUrl, basic, call, define, hookUrl, optional, secret, seg, text, type SendContext, type Spec } from "./define";
import { awsRequest, azureSas, googleToken, parseServiceAccount } from "./signing";

/**
 * On-call and alerting, automation platforms, analytics and observability,
 * and cloud event buses. Alerting services get the report id as their
 * deduplication key, so a retry never pages anyone twice.
 */

const details = (r: ReportPayload) => Object.fromEntries(facts(r));

/** The same body webhook destinations get, with a stable id so retries match. */
const envelope = ({ report, event, isTest, deliveryId }: SendContext) => ({ ...eventEnvelope(event, report, isTest), id: `evt_${deliveryId}` });

/** Flat properties for analytics events. */
const properties = (r: ReportPayload) => ({
  report_id: r.id,
  report_number: r.number,
  title: r.title,
  priority: r.priority,
  source: r.source,
  environment: r.environment,
  page_url: r.pageUrl,
  browser: r.browser ?? r.context.browser,
  os: r.context.os,
  viewport: r.context.viewport,
  project_id: r.project.id,
  project_name: r.project.name,
  attachments: r.attachments.length,
  dashboard_url: r.dashboardUrl,
});

/** Who the event is about, for analytics tools that need a user. */
const distinctId = (r: ReportPayload) => String(r.metadata.user_id ?? r.metadata.userId ?? r.reporter.email ?? `issueit:${r.id}`);

/* ------------------------------------------------------------------ automation platforms */

type AutomationOpts = { id: string; name: string; hosts?: RegExp; placeholder: string; hint: string; keywords?: string[] };

function automation(o: AutomationOpts): Spec {
  return {
    id: o.id,
    name: o.name,
    category: "automation",
    keywords: o.keywords,
    summary: `Starts a ${o.name} workflow with each new report.`,
    fields: [secret("url", "Webhook URL", o.hint, o.placeholder)],
    check(creds) {
      const url = o.hosts ? hookUrl(creds.url, o.name, o.hosts) : baseUrl(creds.url, "webhook URL");
      return { label: `${o.name} · ${new URL(url).host}` };
    },
    async send(ctx) {
      const url = o.hosts ? hookUrl(ctx.creds.url, o.name, o.hosts) : baseUrl(ctx.creds.url, "webhook URL");
      const { status } = await call(o.name, url, { method: "POST", json: envelope(ctx), headers: { "issueit-event": ctx.event, "issueit-delivery": ctx.deliveryId }, thing: "webhook" });
      return { responseStatus: status };
    },
  };
}

/* ------------------------------------------------------------------ analytics: Segment and RudderStack share the Track API */

function trackApi(id: string, name: string, defaultHost: string | null, keywords?: string[]): Spec {
  return {
    id,
    name,
    category: "analytics",
    keywords,
    summary: `Tracks a Bug Reported event in ${name} for each new report.`,
    fields: [
      secret("key", "Write key"),
      ...(defaultHost
        ? [optional(text("url", "API host", "Only for EU or self-hosted workspaces.", `https://${defaultHost}`))]
        : [text("url", "Data plane URL", undefined, "https://acme.dataplane.rudderstack.com")]),
    ],
    async send({ report, creds, isTest }) {
      const root = baseUrl(creds.url || (defaultHost ? `https://${defaultHost}` : undefined), "API host");
      const userId = report.metadata.user_id ?? report.metadata.userId;
      const { status } = await call(name, `${root}/v1/track`, {
        method: "POST",
        headers: basic(creds.key, ""),
        json: {
          event: isTest ? "Bug Reported (test)" : "Bug Reported",
          ...(userId ? { userId: String(userId) } : { anonymousId: distinctId(report) }),
          properties: properties(report),
          messageId: report.id,
          timestamp: report.createdAt,
        },
      });
      return { responseStatus: status };
    },
  };
}

const specs: Spec[] = [
  /* ---------------------------------------------------------------- on-call */
  {
    id: "pagerduty",
    name: "PagerDuty",
    category: "oncall",
    summary: "Triggers a PagerDuty incident for each new report. Best kept to critical reports.",
    fields: [secret("key", "Integration key", "From a service's Integrations tab, using Events API V2."), optional(text("region", "Region", "eu for EU accounts.", "us"))],
    async send({ report, creds, isTest }) {
      const host = creds.region?.toLowerCase() === "eu" ? "events.eu.pagerduty.com" : "events.pagerduty.com";
      const severity = { critical: "critical", high: "error", medium: "warning", low: "info" }[report.priority];
      const { data, status } = await call("PagerDuty", `https://${host}/v2/enqueue`, {
        method: "POST",
        json: {
          routing_key: creds.key,
          event_action: "trigger",
          dedup_key: isTest ? `test-${Date.now()}` : report.id,
          payload: {
            summary: truncate(titleFor(report, isTest), 1000),
            source: report.project.name,
            severity,
            component: report.source,
            group: report.environment ?? undefined,
            custom_details: details(report),
          },
          links: [{ href: report.dashboardUrl, text: "View in Issueit" }],
          client: "Issueit",
          client_url: report.dashboardUrl,
        },
      });
      return { externalId: data.dedup_key, responseStatus: status };
    },
  },
  {
    id: "opsgenie",
    name: "Opsgenie",
    category: "oncall",
    keywords: ["atlassian"],
    summary: "Creates an Opsgenie alert for each new report.",
    fields: [secret("key", "API key", "From an API integration in Opsgenie."), optional(text("region", "Region", "eu for EU accounts.", "us"))],
    async send({ report, creds, isTest }) {
      const host = creds.region?.toLowerCase() === "eu" ? "api.eu.opsgenie.com" : "api.opsgenie.com";
      const priority = { critical: "P1", high: "P2", medium: "P3", low: "P4" }[report.priority];
      const { data, status } = await call("Opsgenie", `https://${host}/v2/alerts`, {
        method: "POST",
        headers: { authorization: `GenieKey ${creds.key}` },
        json: {
          message: truncate(titleFor(report, isTest), 130),
          alias: isTest ? `test-${Date.now()}` : report.id,
          description: plainBody(report, 15_000),
          priority,
          source: "Issueit",
          tags: ["issueit"],
          details: details(report),
        },
      });
      return { externalId: data.requestId, responseStatus: status };
    },
  },
  {
    id: "incidentio",
    name: "incident.io",
    category: "oncall",
    keywords: ["incident io"],
    summary: "Sends each new report to an incident.io HTTP alert source.",
    fields: [text("source", "Alert source config ID", "From the alert source's setup page."), secret("token", "Alert source token")],
    async send({ report, creds, isTest }) {
      const { data, status } = await call("incident.io", `https://api.incident.io/v2/alert_events/http/${seg(creds.source)}`, {
        method: "POST",
        headers: bearer(creds.token),
        json: {
          title: titleFor(report, isTest),
          description: plainBody(report),
          deduplication_key: isTest ? `test-${Date.now()}` : report.id,
          status: "firing",
          source_url: report.dashboardUrl,
          metadata: { ...details(report), priority: report.priority },
        },
      });
      return { externalId: data.deduplication_key, responseStatus: status };
    },
  },
  {
    id: "splunkoncall",
    name: "Splunk On-Call",
    category: "oncall",
    keywords: ["victorops"],
    summary: "Raises a Splunk On-Call alert for each new report.",
    fields: [secret("key", "REST endpoint key", "From Integrations, then REST Generic."), text("routing", "Routing key", undefined, "bugs")],
    async send({ report, creds, isTest }) {
      const type = { critical: "CRITICAL", high: "WARNING", medium: "WARNING", low: "INFO" }[report.priority];
      const { status } = await call("Splunk On-Call", `https://alert.victorops.com/integrations/generic/20131114/alert/${seg(creds.key)}/${seg(creds.routing)}`, {
        method: "POST",
        json: {
          message_type: type,
          entity_id: isTest ? `test-${Date.now()}` : report.id,
          entity_display_name: titleFor(report, isTest),
          state_message: plainBody(report, 8000),
          monitoring_tool: "Issueit",
        },
      });
      return { responseStatus: status };
    },
  },
  {
    id: "squadcast",
    name: "Squadcast",
    category: "oncall",
    summary: "Triggers a Squadcast incident for each new report.",
    fields: [secret("url", "Webhook URL", "From a service's Incident webhook alert source.", "https://api.squadcast.com/v2/incidents/api/…")],
    check(creds) {
      hookUrl(creds.url, "Squadcast", /(^|\.)squadcast\.com$/);
      return { label: "Squadcast alert source" };
    },
    async send({ report, creds, isTest }) {
      const { status } = await call("Squadcast", hookUrl(creds.url, "Squadcast", /(^|\.)squadcast\.com$/), {
        method: "POST",
        json: {
          message: titleFor(report, isTest),
          description: plainBody(report),
          status: "trigger",
          event_id: isTest ? `test-${Date.now()}` : report.id,
          tags: { priority: report.priority, source: report.source },
        },
        thing: "webhook",
      });
      return { responseStatus: status };
    },
  },
  {
    id: "betterstack",
    name: "Better Stack",
    category: "oncall",
    keywords: ["better uptime", "uptime"],
    summary: "Creates a Better Stack incident for each new report.",
    fields: [secret("token", "Uptime API token", "From Better Stack, API tokens."), text("email", "Requester email", "The team member incidents are created on behalf of.")],
    async send({ report, creds, isTest }) {
      const urgent = report.priority === "critical";
      const { data, status } = await call("Better Stack", "https://uptime.betterstack.com/api/v2/incidents", {
        method: "POST",
        headers: bearer(creds.token),
        json: { requester_email: creds.email, name: "Issueit", summary: titleFor(report, isTest), description: plainBody(report), email: true, push: urgent, sms: false, call: false },
      });
      return { externalId: data.data?.id, responseStatus: status };
    },
  },
  {
    id: "zenduty",
    name: "Zenduty",
    category: "oncall",
    summary: "Sends each new report to a Zenduty integration.",
    fields: [secret("key", "Integration key", "From a service's API integration.")],
    async send({ report, creds, isTest }) {
      const alertType = { critical: "critical", high: "error", medium: "warning", low: "info" }[report.priority];
      const { data, status } = await call("Zenduty", `https://www.zenduty.com/api/events/${seg(creds.key)}/`, {
        method: "POST",
        json: {
          alert_type: alertType,
          message: truncate(titleFor(report, isTest), 500),
          summary: plainBody(report),
          entity_id: isTest ? `test-${Date.now()}` : report.id,
          urls: [{ link_url: report.dashboardUrl, link_text: "View in Issueit" }],
        },
      });
      return { externalId: data.entity_id, responseStatus: status };
    },
  },
  {
    id: "ilert",
    name: "ilert",
    category: "oncall",
    summary: "Opens an ilert alert for each new report.",
    fields: [secret("key", "Alert source API key")],
    async send({ report, creds, isTest }) {
      const { status } = await call("ilert", "https://api.ilert.com/api/events", {
        method: "POST",
        json: {
          apiKey: creds.key,
          eventType: "ALERT",
          summary: truncate(titleFor(report, isTest), 255),
          details: plainBody(report),
          alertKey: isTest ? `test-${Date.now()}` : report.id,
          priority: report.priority === "critical" || report.priority === "high" ? "HIGH" : "LOW",
          links: [{ href: report.dashboardUrl, text: "View in Issueit" }],
          customDetails: details(report),
        },
      });
      return { responseStatus: status };
    },
  },
  {
    id: "grafanaoncall",
    name: "Grafana OnCall",
    category: "oncall",
    keywords: ["grafana irm"],
    summary: "Sends each new report to a Grafana OnCall formatted webhook.",
    fields: [secret("url", "Integration URL", "From a Formatted webhook integration.", "https://oncall-prod-…grafana.net/integrations/v1/formatted_webhook/…/")],
    check(creds) {
      return { label: `Grafana OnCall · ${new URL(baseUrl(creds.url, "integration URL")).host}` };
    },
    async send({ report, creds, isTest }) {
      const url = `${baseUrl(creds.url, "integration URL")}/`;
      const { status } = await call("Grafana OnCall", url, {
        method: "POST",
        json: { alert_uid: isTest ? `test-${Date.now()}` : report.id, title: titleFor(report, isTest), message: plainBody(report), state: "alerting", link_to_upstream_details: report.dashboardUrl },
        thing: "integration",
      });
      return { responseStatus: status };
    },
  },

  /* ---------------------------------------------------------------- automation */
  automation({ id: "zapier", name: "Zapier", hosts: /^hooks\.zapier\.com$/, placeholder: "https://hooks.zapier.com/hooks/catch/…", hint: "Start a Zap with Webhooks by Zapier, Catch Hook." }),
  automation({ id: "make", name: "Make", keywords: ["integromat"], hosts: /(^|\.)make\.com$/, placeholder: "https://hook.eu2.make.com/…", hint: "Start a scenario with Webhooks, Custom webhook." }),
  automation({ id: "n8n", name: "n8n", placeholder: "https://n8n.example.com/webhook/…", hint: "Start a workflow with a Webhook node set to POST, and use its production URL." }),
  automation({ id: "pipedream", name: "Pipedream", hosts: /(^|\.)pipedream\.net$/, placeholder: "https://….m.pipedream.net", hint: "Start a workflow with an HTTP / Webhook trigger." }),
  automation({
    id: "powerautomate",
    name: "Power Automate",
    keywords: ["microsoft flow", "logic apps"],
    hosts: /(\.logic\.azure\.com|\.powerplatform\.com)$/,
    placeholder: "https://…logic.azure.com/workflows/…",
    hint: "Start a flow with When a HTTP request is received, set to anyone can trigger.",
  }),
  automation({ id: "workato", name: "Workato", hosts: /(^|\.)workato\.com$/, placeholder: "https://webhooks.workato.com/webhooks/rest/…", hint: "Start a recipe with a Webhooks trigger." }),
  automation({ id: "activepieces", name: "Activepieces", placeholder: "https://cloud.activepieces.com/api/v1/webhooks/…", hint: "Start a flow with the Webhook trigger and use its live URL." }),
  automation({
    id: "tray",
    name: "Tray.ai",
    keywords: ["tray.io"],
    hosts: /(^|\.)(trayapp\.io|tray\.io|tray\.ai)$/,
    placeholder: "https://….trayapp.io",
    hint: "Start a workflow with a Webhook trigger.",
  }),
  {
    id: "ifttt",
    name: "IFTTT",
    category: "automation",
    summary: "Fires an IFTTT Webhooks event for each new report: value1 is the title, value2 the priority, value3 the link.",
    fields: [secret("key", "Webhooks key", "From the Webhooks service's Documentation page."), text("event", "Event name", undefined, "bug_reported")],
    async send({ report, creds, isTest }) {
      const { status } = await call("IFTTT", `https://maker.ifttt.com/trigger/${seg(creds.event)}/with/key/${seg(creds.key)}`, {
        method: "POST",
        json: { value1: titleFor(report, isTest), value2: priorityLabel[report.priority], value3: report.dashboardUrl },
      });
      return { responseStatus: status };
    },
  },
  {
    id: "inngest",
    name: "Inngest",
    category: "automation",
    summary: "Sends an issueit/report.created event to Inngest for each new report.",
    fields: [secret("key", "Event key")],
    async send(ctx) {
      const { data, status } = await call("Inngest", `https://inn.gs/e/${seg(ctx.creds.key)}`, {
        method: "POST",
        json: { name: `issueit/${ctx.event}`, id: ctx.deliveryId, data: envelope(ctx).data, ts: Date.now() },
      });
      return { externalId: data?.ids?.[0], responseStatus: status };
    },
  },

  /* ---------------------------------------------------------------- analytics and observability */
  {
    id: "datadog",
    name: "Datadog",
    category: "analytics",
    summary: "Posts each new report to Datadog as an event, tagged with its priority and project.",
    fields: [secret("key", "API key"), optional(text("site", "Site", "e.g. datadoghq.eu or us5.datadoghq.com.", "datadoghq.com"))],
    async check(creds) {
      const { data } = await call("Datadog", `https://api.${creds.site || "datadoghq.com"}/api/v1/validate`, { headers: { "dd-api-key": creds.key } });
      if (!data.valid) throw new IntegrationError("Datadog says that API key isn't valid.", { retryable: false });
      return { label: `Datadog · ${creds.site || "datadoghq.com"}` };
    },
    async send({ report, creds, isTest }) {
      const alertType = { critical: "error", high: "error", medium: "warning", low: "info" }[report.priority];
      const { data, status } = await call("Datadog", `https://api.${creds.site || "datadoghq.com"}/api/v1/events`, {
        method: "POST",
        headers: { "dd-api-key": creds.key },
        json: {
          title: truncate(titleFor(report, isTest), 100),
          text: `%%% \n${plainBody(report, 3800)}\n %%%`,
          alert_type: alertType,
          aggregation_key: report.id,
          source_type_name: "issueit",
          tags: ["source:issueit", `priority:${report.priority}`, `project:${report.project.name}`, ...(report.environment ? [`env:${report.environment}`] : [])],
        },
      });
      return { externalId: String(data.event?.id ?? ""), externalUrl: data.event?.url, responseStatus: status };
    },
  },
  {
    id: "newrelic",
    name: "New Relic",
    category: "analytics",
    summary: "Records an IssueitReport event in New Relic for each new report, ready to query with NRQL.",
    fields: [text("account", "Account ID"), secret("key", "License key", "An ingest license key."), optional(text("region", "Region", "eu for EU accounts.", "us"))],
    async send({ report, creds }) {
      const host = creds.region?.toLowerCase() === "eu" ? "insights-collector.eu01.nr-data.net" : "insights-collector.newrelic.com";
      const { status } = await call("New Relic", `https://${host}/v1/accounts/${seg(creds.account)}/events`, {
        method: "POST",
        headers: { "api-key": creds.key },
        json: [{ eventType: "IssueitReport", ...Object.fromEntries(Object.entries(properties(report)).filter(([, v]) => v !== null && v !== undefined)) }],
      });
      return { responseStatus: status };
    },
  },
  trackApi("segment", "Segment", "api.segment.io", ["twilio segment", "cdp"]),
  trackApi("rudderstack", "RudderStack", null, ["cdp"]),
  {
    id: "posthog",
    name: "PostHog",
    category: "analytics",
    summary: "Captures a bug reported event in PostHog for each new report.",
    fields: [secret("key", "Project API key", undefined, "phc_…"), optional(text("url", "Host", "https://eu.i.posthog.com for EU Cloud, or your own instance.", "https://us.i.posthog.com"))],
    async send({ report, creds, isTest }) {
      const { status } = await call("PostHog", `${baseUrl(creds.url || "https://us.i.posthog.com")}/capture/`, {
        method: "POST",
        json: {
          api_key: creds.key,
          event: isTest ? "bug reported (test)" : "bug reported",
          distinct_id: distinctId(report),
          timestamp: report.createdAt,
          properties: { ...properties(report), $current_url: report.pageUrl },
        },
      });
      return { responseStatus: status };
    },
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    category: "analytics",
    summary: "Tracks a Bug Reported event in Mixpanel for each new report.",
    fields: [secret("token", "Project token"), optional(text("region", "Region", "eu or in for data residency.", "us"))],
    async send({ report, creds, isTest }) {
      const host = { eu: "api-eu.mixpanel.com", in: "api-in.mixpanel.com" }[creds.region?.toLowerCase() as "eu" | "in"] ?? "api.mixpanel.com";
      const { data, status } = await call("Mixpanel", `https://${host}/track?verbose=1`, {
        method: "POST",
        json: [
          {
            event: isTest ? "Bug Reported (test)" : "Bug Reported",
            properties: { token: creds.token, distinct_id: distinctId(report), time: Math.floor(Date.parse(report.createdAt) / 1000), $insert_id: report.id, ...properties(report) },
          },
        ],
      });
      if (data?.status === 0) throw new IntegrationError(`Mixpanel didn't accept the event. Mixpanel said: "${String(data.error).slice(0, 200)}".`, { retryable: false });
      return { responseStatus: status };
    },
  },
  {
    id: "amplitude",
    name: "Amplitude",
    category: "analytics",
    summary: "Logs a Bug Reported event in Amplitude for each new report.",
    fields: [secret("key", "API key"), optional(text("region", "Region", "eu for EU data centre.", "us"))],
    async send({ report, creds, isTest }) {
      const host = creds.region?.toLowerCase() === "eu" ? "api.eu.amplitude.com" : "api2.amplitude.com";
      const userId = report.metadata.user_id ?? report.metadata.userId;
      const { status } = await call("Amplitude", `https://${host}/2/httpapi`, {
        method: "POST",
        json: {
          api_key: creds.key,
          events: [
            {
              event_type: isTest ? "Bug Reported (test)" : "Bug Reported",
              ...(userId ? { user_id: String(userId) } : { device_id: distinctId(report) }),
              insert_id: report.id,
              time: Date.parse(report.createdAt),
              event_properties: properties(report),
            },
          ],
        },
      });
      return { responseStatus: status };
    },
  },

  /* ---------------------------------------------------------------- cloud event buses */
  {
    id: "sns",
    name: "Amazon SNS",
    category: "cloud",
    keywords: ["aws", "simple notification service"],
    summary: "Publishes each new report to an Amazon SNS topic as JSON.",
    fields: [text("accessKeyId", "Access key ID", "An IAM user allowed sns:Publish on the topic.", "AKIA…"), secret("secretAccessKey", "Secret access key")],
    target: { label: "Topic", fields: [text("topic", "Topic ARN", undefined, "arn:aws:sns:eu-west-2:123456789012:bug-reports")] },
    async send(ctx) {
      const region = ctx.target.topic.split(":")[3];
      if (!region) throw new IntegrationError("That doesn't look like a topic ARN.", { retryable: false });
      const params: Record<string, string> = {
        Action: "Publish",
        Version: "2010-03-31",
        TopicArn: ctx.target.topic,
        Subject: truncate(titleFor(ctx.report, ctx.isTest).replace(/[^\x20-\x7e]/g, " "), 99),
        Message: JSON.stringify(envelope(ctx)),
      };
      if (ctx.target.topic.endsWith(".fifo")) Object.assign(params, { MessageGroupId: ctx.report.project.id, MessageDeduplicationId: ctx.deliveryId });
      const { text: xml, status } = await awsRequest({
        ...aws(ctx, "sns", region),
        host: `sns.${region}.amazonaws.com`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params).toString(),
      });
      return { externalId: /<MessageId>([^<]+)</.exec(xml)?.[1], responseStatus: status };
    },
  },
  {
    id: "sqs",
    name: "Amazon SQS",
    category: "cloud",
    keywords: ["aws", "queue"],
    summary: "Sends each new report to an Amazon SQS queue as JSON.",
    fields: [text("accessKeyId", "Access key ID", "An IAM user allowed sqs:SendMessage on the queue.", "AKIA…"), secret("secretAccessKey", "Secret access key")],
    target: { label: "Queue", fields: [text("queue", "Queue URL", undefined, "https://sqs.eu-west-2.amazonaws.com/123456789012/bug-reports")] },
    async send(ctx) {
      const region = /sqs\.([a-z0-9-]+)\.amazonaws\.com/.exec(ctx.target.queue)?.[1];
      if (!region) throw new IntegrationError("That doesn't look like an SQS queue URL.", { retryable: false });
      const fifo = ctx.target.queue.endsWith(".fifo") ? { MessageGroupId: ctx.report.project.id, MessageDeduplicationId: ctx.deliveryId } : {};
      const { data, status } = await awsRequest({
        ...aws(ctx, "sqs", region),
        host: `sqs.${region}.amazonaws.com`,
        headers: { "content-type": "application/x-amz-json-1.0", "x-amz-target": "AmazonSQS.SendMessage" },
        body: JSON.stringify({ QueueUrl: ctx.target.queue, MessageBody: JSON.stringify(envelope(ctx)), ...fifo }),
      });
      return { externalId: data.MessageId, responseStatus: status };
    },
  },
  {
    id: "eventbridge",
    name: "Amazon EventBridge",
    category: "cloud",
    keywords: ["aws", "event bus"],
    summary: "Puts each new report on an EventBridge event bus, with source issueit.",
    fields: [
      text("accessKeyId", "Access key ID", "An IAM user allowed events:PutEvents on the bus.", "AKIA…"),
      secret("secretAccessKey", "Secret access key"),
      text("region", "Region", undefined, "eu-west-2"),
    ],
    target: { label: "Event bus", fields: [optional(text("bus", "Event bus name or ARN", "Leave empty for the default bus.", "default"))] },
    async send(ctx) {
      const region = ctx.creds.region;
      const { data, status } = await awsRequest({
        ...aws(ctx, "events", region),
        host: `events.${region}.amazonaws.com`,
        headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSEvents.PutEvents" },
        body: JSON.stringify({
          Entries: [{ Source: "issueit", DetailType: ctx.isTest ? "Test bug report" : "Bug report created", Detail: JSON.stringify(envelope(ctx)), EventBusName: ctx.target.bus || "default" }],
        }),
      });
      if (data.FailedEntryCount)
        throw new IntegrationError(`EventBridge didn't accept the event. EventBridge said: "${String(data.Entries?.[0]?.ErrorMessage ?? "unknown error").slice(0, 200)}".`, { retryable: false });
      return { externalId: data.Entries?.[0]?.EventId, responseStatus: status };
    },
  },
  {
    id: "eventgrid",
    name: "Azure Event Grid",
    category: "cloud",
    keywords: ["microsoft azure"],
    summary: "Publishes each new report to an Azure Event Grid topic.",
    fields: [text("endpoint", "Topic endpoint", undefined, "https://bug-reports.uksouth-1.eventgrid.azure.net/api/events"), secret("key", "Access key")],
    async send(ctx) {
      const url = hookUrl(ctx.creds.endpoint, "Event Grid", /\.eventgrid\.azure\.net$/);
      const body = envelope(ctx);
      const { status } = await call("Azure Event Grid", url, {
        method: "POST",
        headers: { "aeg-sas-key": ctx.creds.key },
        json: [
          {
            id: body.id,
            eventType: `Issueit.${ctx.event}`,
            subject: `projects/${ctx.report.project.id}/reports/${ctx.report.id}`,
            eventTime: new Date().toISOString(),
            data: body,
            dataVersion: "1.0",
          },
        ],
      });
      return { responseStatus: status };
    },
  },
  {
    id: "servicebus",
    name: "Azure Service Bus",
    category: "cloud",
    keywords: ["microsoft azure", "queue"],
    summary: "Sends each new report to an Azure Service Bus queue or topic.",
    fields: [secret("connection", "Connection string", "A shared access policy with Send rights.", "Endpoint=sb://acme.servicebus.windows.net/;SharedAccessKeyName=…;SharedAccessKey=…")],
    target: { label: "Queue or topic", fields: [optional(text("entity", "Queue or topic name", "Leave empty if the connection string includes EntityPath."))] },
    check(creds) {
      const c = serviceBus(creds.connection, "");
      return { label: `Service Bus · ${c.namespace}` };
    },
    async send(ctx) {
      const c = serviceBus(ctx.creds.connection, ctx.target.entity);
      if (!c.entity) throw new IntegrationError("Enter the queue or topic name on this destination.", { retryable: false });
      const resource = `https://${c.namespace}/${c.entity}`;
      const { status } = await call("Azure Service Bus", `${resource}/messages`, {
        method: "POST",
        headers: { authorization: azureSas(resource, c.keyName, c.key), brokerproperties: JSON.stringify({ MessageId: ctx.deliveryId, Label: ctx.event }) },
        json: envelope(ctx),
        thing: "queue",
      });
      return { responseStatus: status };
    },
  },
  {
    id: "pubsub",
    name: "Google Cloud Pub/Sub",
    category: "cloud",
    keywords: ["gcp", "google cloud"],
    summary: "Publishes each new report to a Pub/Sub topic as JSON.",
    fields: [secret("serviceAccount", "Service account key", "Paste the JSON key of a service account with Pub/Sub Publisher on the topic.")],
    target: { label: "Topic", fields: [text("topic", "Topic", "The topic name, or its full projects/…/topics/… path.", "bug-reports")] },
    check(creds) {
      return { label: parseServiceAccount(creds.serviceAccount).client_email };
    },
    async send(ctx) {
      const sa = parseServiceAccount(ctx.creds.serviceAccount);
      const topic = ctx.target.topic.startsWith("projects/") ? ctx.target.topic : `projects/${sa.project_id}/topics/${ctx.target.topic}`;
      const token = await googleToken(ctx.creds.serviceAccount, "https://www.googleapis.com/auth/pubsub");
      const { data, status } = await call("Pub/Sub", `https://pubsub.googleapis.com/v1/${topic.split("/").map(seg).join("/")}:publish`, {
        method: "POST",
        headers: bearer(token),
        json: { messages: [{ data: Buffer.from(JSON.stringify(envelope(ctx))).toString("base64"), attributes: { event: ctx.event, report_id: ctx.report.id, priority: ctx.report.priority } }] },
        thing: "topic",
      });
      return { externalId: data.messageIds?.[0], responseStatus: status };
    },
  },
  {
    id: "confluent",
    name: "Confluent Cloud",
    category: "cloud",
    keywords: ["kafka", "apache kafka"],
    summary: "Produces each new report to a Kafka topic through Confluent's REST API.",
    fields: [text("url", "REST endpoint", undefined, "https://pkc-….confluent.cloud:443"), text("cluster", "Cluster ID", undefined, "lkc-…"), text("key", "API key"), secret("secret", "API secret")],
    target: { label: "Topic", fields: [text("topic", "Topic", undefined, "bug-reports")] },
    async send(ctx) {
      const { data, status } = await call("Confluent", `${baseUrl(ctx.creds.url, "REST endpoint")}/kafka/v3/clusters/${seg(ctx.creds.cluster)}/topics/${seg(ctx.target.topic)}/records`, {
        method: "POST",
        headers: basic(ctx.creds.key, ctx.creds.secret),
        json: { key: { type: "STRING", data: ctx.report.id }, value: { type: "JSON", data: envelope(ctx) } },
        thing: "topic",
      });
      if (data?.error_code && data.error_code !== 200)
        throw new IntegrationError(`Confluent didn't accept the record. Confluent said: "${String(data.message).slice(0, 200)}".`, { retryable: data.error_code >= 500 });
      return { externalId: data?.offset !== undefined ? `${data.partition_id}:${data.offset}` : undefined, responseStatus: status };
    },
  },
  {
    id: "cloudflarequeues",
    name: "Cloudflare Queues",
    category: "cloud",
    keywords: ["cloudflare", "workers"],
    summary: "Sends each new report to a Cloudflare Queue for your Workers to consume.",
    fields: [text("account", "Account ID"), secret("token", "API token", "With Queues edit permission.")],
    target: { label: "Queue", fields: [text("queue", "Queue ID")] },
    async send(ctx) {
      const { status } = await call("Cloudflare", `https://api.cloudflare.com/client/v4/accounts/${seg(ctx.creds.account)}/queues/${seg(ctx.target.queue)}/messages`, {
        method: "POST",
        headers: bearer(ctx.creds.token),
        json: { body: envelope(ctx), content_type: "json" },
        thing: "queue",
      });
      return { responseStatus: status };
    },
  },
];

function aws(ctx: SendContext, service: string, region: string) {
  return { service, name: `Amazon ${service.toUpperCase()}`, region, accessKeyId: ctx.creds.accessKeyId, secretAccessKey: ctx.creds.secretAccessKey };
}

function serviceBus(connection: string | undefined, entity: string | undefined) {
  const parts = Object.fromEntries(
    String(connection ?? "")
      .split(";")
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
      }),
  );
  const namespace = /^sb:\/\/([^/]+)/.exec(parts.endpoint ?? "")?.[1];
  const target = entity || parts.entitypath;
  if (!namespace || !parts.sharedaccesskeyname || !parts.sharedaccesskey)
    throw new IntegrationError("That isn't a Service Bus connection string. Copy it from the namespace's Shared access policies.", { retryable: false });
  return { namespace, keyName: parts.sharedaccesskeyname, key: parts.sharedaccesskey, entity: target ?? "" };
}

export const ops: Provider[] = specs.map(define);
