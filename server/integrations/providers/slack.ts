import { config } from "../../config";
import { facts, issueTitle, truncate } from "../format";
import { IntegrationError, request } from "../http";
import type { Provider } from "../types";

const WEBHOOK = /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/;

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const slack: Provider = {
  id: "slack",
  name: "Slack",
  kind: "chat",
  category: "chat",
  summary: "Posts each new report to a Slack channel.",
  targetLabel: null,
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => "https://slack.com/oauth/v2/authorize",
    tokenUrl: () => "https://slack.com/api/oauth.v2.access",
    scopes: ["incoming-webhook"],
    clientId: () => config.oauth.slack.clientId,
    clientSecret: () => config.oauth.slack.clientSecret,
    async complete(token) {
      // Slack reports OAuth failures as 200 with ok: false.
      if (!token.ok) throw new IntegrationError(`Slack didn't complete the connection (${String(token.error ?? "unknown error")}).`, { retryable: false });
      const hook = token.incoming_webhook as { url: string; channel: string; configuration_url?: string };
      const team = (token.team as { name?: string } | undefined)?.name;
      return {
        credentials: { webhookUrl: hook.url },
        account: { label: [hook.channel, team].filter(Boolean).join(" · "), url: hook.configuration_url },
      };
    },
  },
  tokenFields: [
    {
      key: "webhookUrl",
      label: "Incoming webhook URL",
      placeholder: "https://hooks.slack.com/services/…",
      secret: true,
      hint: "Create a Slack app with an incoming webhook for the channel you want.",
    },
    { key: "channel", label: "Channel name", placeholder: "#bugs", optional: true, hint: "Only used to label the connection here." },
  ],
  tokenHelp: { text: "How to create an incoming webhook", url: "https://api.slack.com/messaging/webhooks" },
  async connectWithToken(fields) {
    const webhookUrl = fields.webhookUrl.trim();
    if (!WEBHOOK.test(webhookUrl)) throw new IntegrationError("That isn't a Slack webhook URL. It starts with https://hooks.slack.com/services/.", { retryable: false });
    // Slack webhooks can't be checked without posting, so the first test confirms it.
    return { credentials: { webhookUrl }, account: { label: fields.channel?.trim() || "Slack incoming webhook" } };
  },
  async deliver({ report, connection, isTest }) {
    const title = (isTest ? "[Test] " : "") + issueTitle(report);
    const fieldText = facts(report).map(([k, v]) => `*${k}:* ${escape(truncate(v, 200))}`);
    const { status } = await request("Slack", String(connection!.credentials.webhookUrl), {
      method: "POST",
      thing: "webhook",
      json: {
        text: `New bug report: ${title}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: truncate(title, 150) } },
          { type: "section", text: { type: "mrkdwn", text: escape(truncate(report.description.trim() || "No description provided.", 2900)) } },
          { type: "section", fields: fieldText.slice(0, 10).map((text) => ({ type: "mrkdwn", text })) },
          {
            type: "actions",
            elements: [{ type: "button", text: { type: "plain_text", text: "View in Issueit" }, url: report.dashboardUrl }],
          },
        ],
      },
    });
    return { responseStatus: status };
  },
};
