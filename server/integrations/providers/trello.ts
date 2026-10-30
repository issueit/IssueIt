import { config } from "../../config";
import type { ConnectionAccount } from "../../db/schema";
import { facts, formatBytes, issueTitle, truncate } from "../format";
import { IntegrationError, request } from "../http";
import type { Credentials, Provider, ReportPayload } from "../types";

const API = "https://api.trello.com/1";

/** Trello authenticates with an app key plus a member token, both as query parameters. */
function keyOf(creds: Credentials): string {
  const key = (creds.apiKey as string | undefined) ?? config.oauth.trello.apiKey;
  if (!key) throw new IntegrationError("This Trello connection has no API key. Reconnect the account.", { retryable: false, reconnect: true });
  return key;
}

const url = (path: string, creds: Credentials, extra: Record<string, string> = {}) =>
  `${API}${path}?${new URLSearchParams({ key: keyOf(creds), token: String(creds.accessToken), ...extra })}`;

export async function trelloAccount(creds: Credentials): Promise<ConnectionAccount> {
  const { data } = await request("Trello", url("/members/me", creds, { fields: "fullName,username,url,avatarUrl" }));
  return { label: data.fullName || data.username, url: data.url, avatarUrl: data.avatarUrl ? `${data.avatarUrl}/50.png` : undefined };
}

function cardDescription(r: ReportPayload): string {
  const lines = [r.description.trim() || "No description provided.", "", "---", ""];
  for (const [k, v] of facts(r)) lines.push(`**${k}:** ${v}`);
  if (r.attachments.length) {
    lines.push("", "**Attachments**");
    for (const a of r.attachments) lines.push(`- [${a.filename}](${a.url}) (${formatBytes(a.sizeBytes)})`);
  }
  lines.push("", `[View in Issueit](${r.dashboardUrl})`);
  return truncate(lines.join("\n"), 16000);
}

export const trello: Provider = {
  id: "trello",
  name: "Trello",
  kind: "tracker",
  category: "tracker",
  summary: "Adds a card to a Trello list for each new report.",
  targetLabel: "List",
  events: ["report.created"],
  tokenFields: [
    { key: "apiKey", label: "API key", placeholder: "32 characters", hint: "From a Trello Power-Up you own, under API key." },
    { key: "token", label: "Token", placeholder: "ATTA…", secret: true, hint: "Generate one from the same page with read and write access." },
  ],
  tokenHelp: { text: "Get a key and token from Trello", url: "https://trello.com/power-ups/admin" },
  async connectWithToken(fields) {
    const credentials = { apiKey: fields.apiKey.trim(), accessToken: fields.token.trim() };
    return { credentials, account: await trelloAccount(credentials) };
  },
  async validate(conn) {
    return trelloAccount(conn.credentials);
  },
  async listTargets(conn) {
    const { data } = await request<any[]>(
      "Trello",
      url("/members/me/boards", conn.credentials, { filter: "open", fields: "name", lists: "open", list_fields: "name" }),
    );
    return data.flatMap((board) =>
      (board.lists ?? []).map((list: any) => ({
        id: list.id,
        label: list.name,
        hint: board.name,
        value: { listId: list.id, listName: list.name, boardName: board.name },
      })),
    );
  },
  async deliver({ report, target, connection }) {
    const { data, status } = await request("Trello", url("/cards", connection!.credentials), {
      method: "POST",
      json: { idList: target.listId, name: issueTitle(report), desc: cardDescription(report), pos: "top" },
      thing: "list",
    });
    return { externalId: data.idShort ? `#${data.idShort}` : data.id, externalUrl: data.shortUrl ?? data.url, responseStatus: status };
  },
};
