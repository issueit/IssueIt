import { config } from "../../config";
import type { ConnectionAccount, Priority } from "../../db/schema";
import { issueTitle, plainMarkdownBody } from "../format";
import { request } from "../http";
import type { Provider, TargetOption } from "../types";

const API = "https://api.clickup.com/api/v2";
/** ClickUp takes both personal and OAuth tokens in the Authorization header without a scheme. */
const auth = (token: string) => ({ authorization: token });

async function account(token: string): Promise<ConnectionAccount> {
  const [{ data: me }, { data: teams }] = await Promise.all([
    request("ClickUp", `${API}/user`, { headers: auth(token) }),
    request("ClickUp", `${API}/team`, { headers: auth(token) }),
  ]);
  const workspace = teams.teams?.[0]?.name;
  return { label: workspace ? `${workspace} · ${me.user.username}` : me.user.username, avatarUrl: me.user.profilePicture ?? undefined };
}

const priorityMap: Record<Priority, number> = { critical: 1, high: 2, medium: 3, low: 4 };

export const clickup: Provider = {
  id: "clickup",
  name: "ClickUp",
  kind: "tracker",
  category: "tracker",
  summary: "Creates a task in a ClickUp list for each new report.",
  targetLabel: "List",
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => "https://app.clickup.com/api",
    tokenUrl: () => `${API}/oauth/token`,
    scopes: [],
    tokenRequest: "query",
    clientId: () => config.oauth.clickup.clientId,
    clientSecret: () => config.oauth.clickup.clientSecret,
    async complete(token) {
      const accessToken = String(token.access_token);
      return { credentials: { accessToken }, account: await account(accessToken) };
    },
  },
  tokenFields: [{ key: "token", label: "Personal API token", placeholder: "pk_…", secret: true, hint: "From ClickUp settings, under Apps." }],
  tokenHelp: { text: "Find your token in ClickUp", url: "https://app.clickup.com/settings/apps" },
  async connectWithToken(fields) {
    const accessToken = fields.token.trim();
    return { credentials: { accessToken }, account: await account(accessToken) };
  },
  async validate(conn) {
    return account(await conn.accessToken());
  },
  async listTargets(conn) {
    const token = await conn.accessToken();
    const get = (path: string) => request("ClickUp", `${API}${path}`, { headers: auth(token) }).then((r) => r.data);
    const options: TargetOption[] = [];
    const { teams } = await get("/team");
    for (const team of (teams ?? []).slice(0, 5)) {
      const { spaces } = await get(`/team/${team.id}/space?archived=false`);
      for (const space of (spaces ?? []).slice(0, 20)) {
        const [folders, lists] = await Promise.all([get(`/space/${space.id}/folder?archived=false`), get(`/space/${space.id}/list?archived=false`)]);
        const add = (list: any, path: string) =>
          options.push({ id: list.id, label: list.name, hint: path, value: { listId: list.id, listName: list.name, path } });
        for (const list of lists.lists ?? []) add(list, `${team.name} / ${space.name}`);
        for (const folder of folders.folders ?? []) for (const list of folder.lists ?? []) add(list, `${team.name} / ${space.name} / ${folder.name}`);
      }
    }
    return options;
  },
  async deliver({ report, target, connection }) {
    const body = plainMarkdownBody(report);
    const { data, status } = await request("ClickUp", `${API}/list/${target.listId}/task`, {
      method: "POST",
      headers: auth(await connection!.accessToken()),
      json: { name: issueTitle(report), markdown_content: body, markdown_description: body, priority: priorityMap[report.priority] },
      thing: "list",
    });
    return { externalId: data.custom_id ?? data.id, externalUrl: data.url, responseStatus: status };
  },
};
