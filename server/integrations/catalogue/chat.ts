import { createHmac, randomUUID } from "node:crypto";
import { escapeHtml, facts, htmlBody, plainBody, plainMarkdownBody, priorityLabel, titleFor, truncate } from "../format";
import { bearer, IntegrationError } from "../http";
import type { Provider, ReportPayload } from "../types";
import { baseUrl, basic, call, define, hookUrl, optional, secret, seg, text, type Spec } from "./define";

/** Chat services: each new report is posted as a message. */

const description = (r: ReportPayload, max = 1500) => truncate(r.description.trim() || "No description provided.", max);

/** Markdown most chat apps render: bold title, description, facts, link. */
function chatMarkdown(r: ReportPayload, isTest: boolean, bold = "**") {
  return [`${bold}${titleFor(r, isTest)}${bold}`, description(r), "", ...facts(r).map(([k, v]) => `${bold}${k}:${bold} ${truncate(v, 200)}`), "", `[View in Issueit](${r.dashboardUrl})`].join("\n");
}

/** Plain lines for apps that don't format messages. */
const chatPlain = (r: ReportPayload, isTest: boolean, max = 3500) => `${titleFor(r, isTest)}\n\n${plainBody(r, max)}`;

type HookOpts = {
  id: string;
  name: string;
  summary?: string;
  keywords?: string[];
  /** Hosts the webhook must live on. Omitted for self-hosted services. */
  hosts?: RegExp;
  placeholder: string;
  hint: string;
  help?: { text: string; url: string };
  body(report: ReportPayload, isTest: boolean): unknown;
  /** Services that answer 200 with an error code in the body. */
  ok?(data: any): string | null;
  contentType?: string;
};

/** A service that posts to a single incoming-webhook URL. */
function hook(o: HookOpts): Spec {
  return {
    id: o.id,
    name: o.name,
    category: "chat",
    keywords: o.keywords,
    summary: o.summary ?? `Posts each new report to ${o.name}.`,
    fields: [secret("url", "Webhook URL", o.hint, o.placeholder)],
    help: o.help,
    check(creds) {
      const url = o.hosts ? hookUrl(creds.url, o.name, o.hosts) : baseUrl(creds.url, "webhook URL");
      return { label: `${o.name} · ${new URL(url).host}` };
    },
    async send({ report, creds, isTest }) {
      const url = o.hosts ? hookUrl(creds.url, o.name, o.hosts) : baseUrl(creds.url, "webhook URL");
      const body = o.body(report, isTest);
      const { data, status } = await call(o.name, url, {
        method: "POST",
        ...(typeof body === "string" ? { body, headers: { "content-type": o.contentType ?? "text/plain; charset=utf-8" } } : { json: body }),
        thing: "webhook",
      });
      const problem = o.ok?.(data);
      if (problem) throw new IntegrationError(`${o.name} didn't accept the message. ${o.name} said: "${problem.slice(0, 200)}".`, { retryable: false });
      return { responseStatus: status };
    },
  };
}

/** Feishu and Lark are the same product on two hosts, with optional signature checking. */
function feishu(id: string, name: string, host: string): Spec {
  return {
    id,
    name,
    category: "chat",
    keywords: ["bytedance"],
    summary: `Posts each new report to a ${name} group through a custom bot.`,
    fields: [
      secret("url", "Webhook URL", "From the group's settings, Bots, then Add a custom bot.", `https://${host}/open-apis/bot/v2/hook/…`),
      optional(secret("signing", "Signing secret", "Only if the bot has signature verification turned on.")),
    ],
    check(creds) {
      hookUrl(creds.url, name, new RegExp(`^${host.replace(/\./g, "\\.")}$`));
      return { label: `${name} custom bot` };
    },
    async send({ report, creds, isTest }) {
      const url = hookUrl(creds.url, name, new RegExp(`^${host.replace(/\./g, "\\.")}$`));
      const timestamp = String(Math.floor(Date.now() / 1000));
      const sign = creds.signing ? createHmac("sha256", `${timestamp}\n${creds.signing}`).update("").digest("base64") : undefined;
      const { data, status } = await call(name, url, {
        method: "POST",
        json: {
          ...(sign ? { timestamp, sign } : {}),
          msg_type: "post",
          content: {
            post: {
              en_us: {
                title: titleFor(report, isTest),
                content: [
                  [{ tag: "text", text: description(report) }],
                  ...facts(report).map(([k, v]) => [{ tag: "text", text: `${k}: ${truncate(v, 200)}` }]),
                  [{ tag: "a", text: "View in Issueit", href: report.dashboardUrl }],
                ],
              },
            },
          },
        },
        thing: "webhook",
      });
      if (data?.code) throw new IntegrationError(`${name} didn't accept the message. ${name} said: "${String(data.msg).slice(0, 200)}".`, { retryable: false });
      return { responseStatus: status };
    },
  };
}

const errcode = (data: any) => (data?.errcode ? String(data.errmsg ?? data.errcode) : null);

const specs: Spec[] = [
  hook({
    id: "teams",
    name: "Microsoft Teams",
    keywords: ["ms teams", "power automate", "workflows"],
    summary: "Posts each new report to a Teams channel as an adaptive card.",
    hosts: /(\.logic\.azure\.com|\.powerplatform\.com|\.webhook\.office\.com|\.api\.powerplatform\.com)$/,
    placeholder: "https://…logic.azure.com/workflows/…",
    hint: "In the channel, open Workflows and add Post to a channel when a webhook request is received.",
    help: {
      text: "Create an incoming webhook with Workflows",
      url: "https://support.microsoft.com/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498",
    },
    body: (r, isTest) => ({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              { type: "TextBlock", text: titleFor(r, isTest), weight: "Bolder", size: "Medium", wrap: true },
              { type: "TextBlock", text: description(r), wrap: true },
              { type: "FactSet", facts: facts(r).map(([title, value]) => ({ title, value: truncate(value, 300) })) },
            ],
            actions: [{ type: "Action.OpenUrl", title: "View in Issueit", url: r.dashboardUrl }],
          },
        },
      ],
    }),
  }),
  hook({
    id: "googlechat",
    name: "Google Chat",
    keywords: ["hangouts chat", "google workspace"],
    hosts: /^chat\.googleapis\.com$/,
    placeholder: "https://chat.googleapis.com/v1/spaces/…/messages?key=…",
    hint: "In the space, open Apps & integrations, then Webhooks.",
    body: (r, isTest) => ({
      text: [`*${titleFor(r, isTest)}*`, description(r), "", ...facts(r).map(([k, v]) => `*${k}:* ${truncate(v, 200)}`), "", `<${r.dashboardUrl}|View in Issueit>`].join("\n"),
    }),
  }),
  hook({
    id: "mattermost",
    name: "Mattermost",
    placeholder: "https://chat.example.com/hooks/…",
    hint: "In Mattermost, open Integrations, then Incoming webhooks.",
    body: (r, isTest) => ({ username: "Issueit", text: `#### ${titleFor(r, isTest)}\n${plainMarkdownBody(r).slice(0, 15_000)}` }),
  }),
  hook({
    id: "rocketchat",
    name: "Rocket.Chat",
    keywords: ["rocket chat"],
    placeholder: "https://chat.example.com/hooks/…",
    hint: "In Rocket.Chat, open Administration, then Integrations, then New incoming webhook.",
    body: (r, isTest) => ({
      alias: "Issueit",
      text: `*${titleFor(r, isTest)}*`,
      attachments: [
        {
          title: "View in Issueit",
          title_link: r.dashboardUrl,
          text: description(r, 4000),
          fields: facts(r).map(([title, value]) => ({ title, value: truncate(value, 300), short: value.length < 40 })),
        },
      ],
    }),
  }),
  hook({
    id: "pumble",
    name: "Pumble",
    hosts: /(^|\.)pumble\.com$/,
    placeholder: "https://api.pumble.com/workspaces/…/incomingWebhooks/postMessage/…",
    hint: "In Pumble, open the channel's Integrations, then Incoming webhooks.",
    body: (r, isTest) => ({ text: chatMarkdown(r, isTest, "*") }),
  }),
  hook({
    id: "flock",
    name: "Flock",
    hosts: /(^|\.)flock\.(com|co)$/,
    placeholder: "https://api.flock.com/hooks/sendMessage/…",
    hint: "In Flock, open the App Store, then Incoming webhook.",
    body: (r, isTest) => ({ text: chatPlain(r, isTest, 3500) }),
  }),
  hook({
    id: "chanty",
    name: "Chanty",
    hosts: /(^|\.)chanty\.com$/,
    placeholder: "https://…chanty.com/…",
    hint: "In Chanty, open Integrations, then Webhooks, and pick the conversation.",
    body: (r, isTest) => ({ text: chatMarkdown(r, isTest) }),
  }),
  hook({
    id: "twist",
    name: "Twist",
    keywords: ["doist"],
    hosts: /(^|\.)twist\.com$/,
    placeholder: "https://twist.com/api/v3/integration_incoming/post_data?install_id=…",
    hint: "In Twist, add the Incoming webhook integration to a channel or thread.",
    body: (r, isTest) => ({ content: chatMarkdown(r, isTest) }),
  }),
  hook({
    id: "campfire",
    name: "Campfire",
    keywords: ["once", "37signals"],
    placeholder: "https://campfire.example.com/rooms/1/2-abc/messages",
    hint: "In Campfire, open Account, then Bots, add a bot and copy its URL for the room.",
    body: (r, isTest) => chatPlain(r, isTest, 3500),
  }),
  hook({
    id: "basecamp",
    name: "Basecamp",
    keywords: ["campfire", "chatbot", "37signals"],
    summary: "Posts each new report to a Basecamp Campfire through a chatbot.",
    hosts: /(^|\.)basecamp\.com$/,
    placeholder: "https://3.basecamp.com/…/integrations/…/buckets/…/chats/…/lines",
    hint: "Create a chatbot for the project, then copy its line URL.",
    help: { text: "Basecamp chatbots", url: "https://github.com/basecamp/bc3-api/blob/master/sections/chatbots.md" },
    body: (r, isTest) => ({
      content: `<strong>${escapeHtml(titleFor(r, isTest))}</strong>${htmlBody(r).replace(
        /<table>[\s\S]*?<\/table>/,
        facts(r)
          .map(([k, v]) => `<br>${escapeHtml(k)}: ${escapeHtml(v)}`)
          .join(""),
      )}`,
    }),
  }),
  hook({
    id: "ringcentral",
    name: "RingCentral",
    keywords: ["glip"],
    hosts: /^hooks\.ringcentral\.com$/,
    placeholder: "https://hooks.ringcentral.com/webhook/v2/…",
    hint: "In RingCentral, add the Incoming webhook app to the team.",
    body: (r, isTest) => ({ text: chatMarkdown(r, isTest) }),
  }),
  hook({
    id: "dingtalk",
    name: "DingTalk",
    hosts: /^oapi\.dingtalk\.com$/,
    placeholder: "https://oapi.dingtalk.com/robot/send?access_token=…",
    hint: "Add a custom robot to the group. Use keyword security with the word Issueit.",
    body: (r, isTest) => ({
      msgtype: "markdown",
      markdown: { title: `Issueit: ${titleFor(r, isTest)}`, text: `### Issueit: ${titleFor(r, isTest)}\n\n${chatMarkdown(r, isTest).split("\n").slice(1).join("\n\n")}` },
    }),
    ok: errcode,
  }),
  hook({
    id: "wecom",
    name: "WeCom",
    keywords: ["wechat work", "企业微信"],
    hosts: /^qyapi\.weixin\.qq\.com$/,
    placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…",
    hint: "In the group chat, add a group robot and copy its webhook address.",
    body: (r, isTest) => ({ msgtype: "markdown", markdown: { content: truncate(chatMarkdown(r, isTest), 4000) } }),
    ok: errcode,
  }),
  feishu("feishu", "Feishu", "open.feishu.cn"),
  feishu("lark", "Lark", "open.larksuite.com"),
  {
    id: "zulip",
    name: "Zulip",
    category: "chat",
    summary: "Posts each new report to a Zulip channel and topic.",
    fields: [text("url", "Zulip URL", undefined, "https://acme.zulipchat.com"), text("bot", "Bot email", "An incoming webhook or generic bot."), secret("token", "Bot API key")],
    target: { label: "Channel", fields: [text("channel", "Channel", undefined, "engineering"), optional(text("topic", "Topic", "Leave empty for Bug reports.", "Bug reports"))] },
    async check(creds) {
      const { data } = await call("Zulip", `${baseUrl(creds.url)}/api/v1/users/me`, { headers: basic(creds.bot, creds.token) });
      return { label: data.full_name };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const { data, status } = await call("Zulip", `${root}/api/v1/messages`, {
        method: "POST",
        headers: basic(creds.bot, creds.token),
        form: { type: "stream", to: target.channel, topic: target.topic || "Bug reports", content: chatMarkdown(report, isTest) },
        thing: "channel",
      });
      return { externalId: String(data.id), externalUrl: `${root}/#narrow/near/${data.id}`, responseStatus: status };
    },
  },
  {
    id: "webex",
    name: "Webex",
    category: "chat",
    keywords: ["cisco"],
    summary: "Posts each new report to a Webex space through a bot.",
    fields: [secret("token", "Bot access token", "Create a bot on the Webex developer site and add it to the space.")],
    help: { text: "Create a Webex bot", url: "https://developer.webex.com/my-apps/new/bot" },
    target: { label: "Space", fields: [text("room", "Space ID", "The roomId of the space.")] },
    async check(creds) {
      const { data } = await call("Webex", "https://webexapis.com/v1/people/me", { headers: bearer(creds.token) });
      return { label: data.displayName };
    },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Webex", "https://webexapis.com/v1/messages", {
        method: "POST",
        headers: bearer(creds.token),
        json: { roomId: target.room, markdown: chatMarkdown(report, isTest) },
        thing: "space",
      });
      return { externalId: data.id, responseStatus: status };
    },
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "chat",
    summary: "Sends each new report to a Telegram chat, group or channel through your bot.",
    fields: [secret("token", "Bot token", "From @BotFather. Add the bot to the chat first.", "123456:ABC…")],
    help: { text: "Create a bot with BotFather", url: "https://core.telegram.org/bots/features#botfather" },
    target: { label: "Chat", fields: [text("chat", "Chat ID", "A numeric id, or @channelname for public channels.", "-1001234567890")] },
    async check(creds) {
      const { data } = await call("Telegram", `https://api.telegram.org/bot${creds.token}/getMe`);
      return { label: `@${data.result.username}` };
    },
    async send({ report, creds, target, isTest }) {
      const html = [
        `<b>${escapeHtml(titleFor(report, isTest))}</b>`,
        escapeHtml(description(report, 2500)),
        "",
        ...facts(report).map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(truncate(v, 200))}`),
        "",
        `<a href="${escapeHtml(report.dashboardUrl)}">View in Issueit</a>`,
      ].join("\n");
      const { data, status } = await call("Telegram", `https://api.telegram.org/bot${creds.token}/sendMessage`, {
        method: "POST",
        json: { chat_id: target.chat, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } },
        thing: "chat",
      });
      return { externalId: String(data.result?.message_id ?? ""), responseStatus: status };
    },
  },
  {
    id: "matrix",
    name: "Matrix",
    category: "chat",
    keywords: ["element"],
    summary: "Posts each new report to a Matrix room.",
    fields: [text("url", "Homeserver URL", undefined, "https://matrix.org"), secret("token", "Access token", "For a bot account that has joined the room. In Element, Settings, then Help & about.")],
    target: { label: "Room", fields: [text("room", "Room ID or alias", undefined, "!abc123:matrix.org")] },
    async check(creds) {
      const { data } = await call("Matrix", `${baseUrl(creds.url)}/_matrix/client/v3/account/whoami`, { headers: bearer(creds.token) });
      return { label: data.user_id };
    },
    async send({ report, creds, target, isTest, deliveryId }) {
      const root = baseUrl(creds.url);
      let room = target.room;
      if (room.startsWith("#")) {
        const { data } = await call("Matrix", `${root}/_matrix/client/v3/directory/room/${seg(room)}`, { headers: bearer(creds.token), thing: "room" });
        room = data.room_id;
      }
      // The delivery id as transaction id makes retries idempotent.
      const { data, status } = await call("Matrix", `${root}/_matrix/client/v3/rooms/${seg(room)}/send/m.room.message/${seg(deliveryId)}`, {
        method: "PUT",
        headers: bearer(creds.token),
        json: { msgtype: "m.text", body: chatPlain(report, isTest, 20_000), format: "org.matrix.custom.html", formatted_body: `<h4>${escapeHtml(titleFor(report, isTest))}</h4>${htmlBody(report)}` },
        thing: "room",
      });
      return { externalId: data.event_id, externalUrl: `https://matrix.to/#/${room}/${data.event_id}`, responseStatus: status };
    },
  },
  {
    id: "zohocliq",
    name: "Zoho Cliq",
    category: "chat",
    keywords: ["zoho"],
    summary: "Posts each new report to a Zoho Cliq channel.",
    fields: [
      secret("token", "Webhook token", "In Cliq, open Bots & tools, then Webhook tokens."),
      optional(text("domain", "Data centre domain", "e.g. zoho.eu or zoho.in. Leave empty for zoho.com.", "zoho.com")),
    ],
    target: { label: "Channel", fields: [text("channel", "Channel unique name", "From the channel's info.", "bugs")] },
    async send({ report, creds, target, isTest }) {
      const { status } = await call("Zoho Cliq", `https://cliq.${creds.domain || "zoho.com"}/api/v2/channelsbyname/${seg(target.channel)}/message?zapikey=${seg(creds.token)}`, {
        method: "POST",
        json: { text: chatMarkdown(report, isTest, "*"), bot: { name: "Issueit" } },
        thing: "channel",
      });
      return { responseStatus: status };
    },
  },
  {
    id: "line",
    name: "LINE",
    category: "chat",
    summary: "Pushes each new report to a LINE user or group through your Messaging API channel.",
    fields: [secret("token", "Channel access token", "From the LINE Developers console, Messaging API tab.")],
    target: { label: "Recipient", fields: [text("to", "User, group or room ID", "The id of the chat the bot belongs to.", "C1234…")] },
    async check(creds) {
      const { data } = await call("LINE", "https://api.line.me/v2/bot/info", { headers: bearer(creds.token) });
      return { label: data.displayName };
    },
    async send({ report, creds, target, isTest }) {
      const { status } = await call("LINE", "https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { ...bearer(creds.token), "x-line-retry-key": randomUUID() },
        json: { to: target.to, messages: [{ type: "text", text: chatPlain(report, isTest, 4900) }] },
        thing: "recipient",
      });
      return { responseStatus: status };
    },
  },
  {
    id: "zoom",
    name: "Zoom Team Chat",
    category: "chat",
    keywords: ["zoom chat"],
    summary: "Posts each new report to a Zoom Team Chat channel.",
    fields: [
      secret("url", "Endpoint URL", "Add the Incoming Webhook app, then type /inc connect issueit in the channel.", "https://integrations.zoom.us/chat/webhooks/incomingwebhook/…"),
      secret("token", "Verification token"),
    ],
    check(creds) {
      hookUrl(creds.url, "Zoom", /^integrations\.zoom\.us$/);
      return { label: "Zoom incoming webhook" };
    },
    async send({ report, creds, isTest }) {
      const url = hookUrl(creds.url, "Zoom", /^integrations\.zoom\.us$/);
      const { status } = await call("Zoom", `${url}${url.includes("?") ? "&" : "?"}format=full`, {
        method: "POST",
        headers: { authorization: creds.token },
        json: { content: { head: { text: titleFor(report, isTest) }, body: [{ type: "message", text: plainBody(report, 3500) }] } },
        thing: "webhook",
      });
      return { responseStatus: status };
    },
  },
  {
    id: "threema",
    name: "Threema",
    category: "chat",
    keywords: ["threema gateway"],
    summary: "Sends each new report to a Threema ID through Threema Gateway.",
    fields: [text("from", "Gateway ID", "A Basic mode ID, starting with *.", "*ISSUEIT"), secret("secret", "API secret")],
    target: { label: "Recipient", fields: [text("to", "Threema ID", undefined, "ABCD1234")] },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Threema", "https://msgapi.threema.ch/send_simple", {
        method: "POST",
        form: { from: creds.from, to: target.to.toUpperCase(), secret: creds.secret, text: truncate(`${titleFor(report, isTest)}\n${priorityLabel[report.priority]} · ${report.dashboardUrl}`, 3000) },
        thing: "recipient",
      });
      return { externalId: typeof data === "string" ? data.trim() : undefined, responseStatus: status };
    },
  },
];

export const chats: Provider[] = specs.map(define);
