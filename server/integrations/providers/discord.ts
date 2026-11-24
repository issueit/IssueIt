import { config } from "../../config";
import type { ConnectionAccount, Priority } from "../../db/schema";
import { facts, issueTitle, truncate } from "../format";
import { IntegrationError, request } from "../http";
import type { Provider } from "../types";

const WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/;

/** Restrained signal colours, matching the dashboard's priority pills. */
const colour: Record<Priority, number> = { critical: 0xe0716f, high: 0xcfae74, medium: 0x8a8a8a, low: 0x5e5e5e };

async function account(webhookUrl: string): Promise<ConnectionAccount> {
  const { data } = await request("Discord", webhookUrl, { thing: "webhook" });
  return { label: data.name ?? "Discord webhook", extra: { channelId: String(data.channel_id ?? ""), guildId: String(data.guild_id ?? "") } };
}

export const discord: Provider = {
  id: "discord",
  name: "Discord",
  kind: "chat",
  category: "chat",
  summary: "Posts each new report to a Discord channel.",
  targetLabel: null,
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => "https://discord.com/oauth2/authorize",
    tokenUrl: () => "https://discord.com/api/oauth2/token",
    scopes: ["webhook.incoming"],
    clientId: () => config.oauth.discord.clientId,
    clientSecret: () => config.oauth.discord.clientSecret,
    async complete(token) {
      const hook = token.webhook as { url?: string; name?: string; channel_id?: string; guild_id?: string } | undefined;
      if (!hook?.url) throw new IntegrationError("Discord didn't return a channel webhook. Try connecting again and choose a channel.", { retryable: false });
      return {
        credentials: { webhookUrl: hook.url },
        account: { label: hook.name ?? "Discord webhook", extra: { channelId: hook.channel_id ?? "", guildId: hook.guild_id ?? "" } },
      };
    },
  },
  tokenFields: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      placeholder: "https://discord.com/api/webhooks/…",
      secret: true,
      hint: "In Discord, open the channel's settings, then Integrations, then Webhooks.",
    },
  ],
  tokenHelp: { text: "How to create a Discord webhook", url: "https://support.discord.com/hc/en-us/articles/228383668" },
  async connectWithToken(fields) {
    const webhookUrl = fields.webhookUrl.trim();
    if (!WEBHOOK.test(webhookUrl)) throw new IntegrationError("That isn't a Discord webhook URL. It starts with https://discord.com/api/webhooks/.", { retryable: false });
    return { credentials: { webhookUrl }, account: await account(webhookUrl) };
  },
  async validate(conn) {
    return account(String(conn.credentials.webhookUrl));
  },
  async deliver({ report, connection, isTest }) {
    const webhookUrl = String(connection!.credentials.webhookUrl);
    const post = (json: Record<string, unknown>) => request("Discord", `${webhookUrl}?wait=true`, { method: "POST", thing: "webhook", json });
    /**
     * A report that arrived with a design of its own — a Discord-style post
     * from a game, or `discord` sent through the API — goes on looking the
     * way its sender made it. Mentions stay off: a post relayed by Issueit
     * can't ping a server. If Discord refuses the design, the report still
     * arrives, in Issueit's own layout.
     */
    let sent: Awaited<ReturnType<typeof post>> | null = null;
    if (report.discord && !isTest) {
      const { username, avatar_url, content, embeds } = report.discord;
      try {
        sent = await post({ username: username || "Issueit", ...(avatar_url ? { avatar_url } : {}), ...(content ? { content } : {}), embeds, allowed_mentions: { parse: [] } });
      } catch (err) {
        if (!(err instanceof IntegrationError) || err.status !== 400) throw err;
      }
    }
    const { data, status } =
      sent ??
      (await post({
        username: "Issueit",
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: truncate((isTest ? "[Test] " : "") + issueTitle(report), 250),
            url: report.dashboardUrl,
            description: truncate(report.description.trim() || "No description provided.", 3000),
            color: colour[report.priority],
            fields: facts(report)
              .filter(([k]) => k !== "Project")
              .map(([name, value]) => ({ name, value: truncate(value, 1000), inline: value.length < 40 })),
            footer: { text: `${report.project.name} · ${report.id}` },
            timestamp: report.createdAt,
          },
        ],
      }));
    const guild = data?.guild_id ?? connection!.account.extra?.guildId;
    const externalUrl = guild && data?.channel_id ? `https://discord.com/channels/${guild}/${data.channel_id}/${data.id}` : undefined;
    return { externalId: data?.id, externalUrl, responseStatus: status };
  },
};
