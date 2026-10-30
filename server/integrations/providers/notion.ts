import { config } from "../../config";
import type { ConnectionAccount } from "../../db/schema";
import { facts, formatBytes, issueTitle, priorityLabel } from "../format";
import { bearer, request } from "../http";
import type { Provider, ReportPayload } from "../types";

const API = "https://api.notion.com/v1";
/** Pinned so database semantics stay stable. */
const headers = (token: string) => ({ ...bearer(token), "notion-version": "2022-06-28" });

async function account(token: string): Promise<ConnectionAccount> {
  const { data } = await request("Notion", `${API}/users/me`, { headers: headers(token) });
  return { label: data.bot?.workspace_name ?? data.name ?? "Notion workspace", avatarUrl: data.avatar_url ?? undefined };
}

const text = (content: string, link?: string) => ({ type: "text", text: { content: content.slice(0, 2000), link: link ? { url: link } : null } });
const paragraph = (...rich: object[]) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich } });

function blocks(r: ReportPayload) {
  const out: object[] = [];
  const description = r.description.trim() || "No description provided.";
  // Notion caps a text object at 2,000 characters.
  for (let i = 0; i < Math.min(description.length, 20000); i += 2000) out.push(paragraph(text(description.slice(i, i + 2000))));
  out.push({ object: "block", type: "divider", divider: {} });
  for (const [k, v] of facts(r))
    out.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ ...text(`${k}: `), annotations: { bold: true } }, text(v)] } });
  for (const a of r.attachments) out.push(paragraph(text(`${a.filename} (${formatBytes(a.sizeBytes)})`, a.url)));
  out.push(paragraph(text("View in Issueit", r.dashboardUrl)));
  return out.slice(0, 100);
}

export const notion: Provider = {
  id: "notion",
  name: "Notion",
  kind: "tracker",
  category: "tracker",
  summary: "Adds a page to a Notion database for each new report.",
  targetLabel: "Database",
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: () => `${API}/oauth/token`,
    scopes: [],
    tokenRequest: "basic-json",
    extraParams: { owner: "user" },
    clientId: () => config.oauth.notion.clientId,
    clientSecret: () => config.oauth.notion.clientSecret,
    async complete(token) {
      const accessToken = String(token.access_token);
      return {
        credentials: { accessToken, refreshToken: token.refresh_token as string | undefined },
        account: { label: String(token.workspace_name ?? "Notion workspace"), avatarUrl: (token.workspace_icon as string) || undefined },
      };
    },
  },
  tokenFields: [
    {
      key: "token",
      label: "Internal integration secret",
      placeholder: "ntn_…",
      secret: true,
      hint: "Create an internal integration, then share the database with it from the database's Connections menu.",
    },
  ],
  tokenHelp: { text: "Create an integration in Notion", url: "https://www.notion.so/profile/integrations" },
  async connectWithToken(fields) {
    const accessToken = fields.token.trim();
    return { credentials: { accessToken }, account: await account(accessToken) };
  },
  async validate(conn) {
    return account(await conn.accessToken());
  },
  async listTargets(conn) {
    const { data } = await request("Notion", `${API}/search`, {
      method: "POST",
      headers: headers(await conn.accessToken()),
      json: { filter: { property: "object", value: "database" }, page_size: 100 },
    });
    return (data.results ?? []).map((db: any) => {
      const name = (db.title ?? []).map((t: any) => t.plain_text).join("") || "Untitled database";
      const props = Object.entries<any>(db.properties ?? {});
      const titleProperty = props.find(([, p]) => p.type === "title")?.[0] ?? "Name";
      const priorityProperty = props.find(([key, p]) => /priority|severity/i.test(key) && p.type === "select")?.[0];
      return { id: db.id, label: name, value: { databaseId: db.id, databaseName: name, titleProperty, priorityProperty } };
    });
  },
  async deliver({ report, target, connection }) {
    const properties: Record<string, unknown> = {
      [String(target.titleProperty ?? "Name")]: { title: [text(issueTitle(report))] },
    };
    if (target.priorityProperty) properties[String(target.priorityProperty)] = { select: { name: priorityLabel[report.priority] } };
    const { data, status } = await request("Notion", `${API}/pages`, {
      method: "POST",
      headers: headers(await connection!.accessToken()),
      json: { parent: { database_id: target.databaseId }, properties, children: blocks(report) },
      thing: "database (share it with the Issueit integration)",
    });
    return { externalId: data.id, externalUrl: data.url, responseStatus: status };
  },
};
