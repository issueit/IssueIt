import { config } from "../../config";
import type { ConnectionAccount } from "../../db/schema";
import { issueTitle, markdownBody } from "../format";
import { bearer, request } from "../http";
import type { Provider } from "../types";

const API = "https://api.github.com";
const headers = (token: string) => ({ ...bearer(token), accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" });

async function account(token: string): Promise<ConnectionAccount> {
  const { data } = await request("GitHub", `${API}/user`, { headers: headers(token) });
  return { label: data.login, url: data.html_url, avatarUrl: data.avatar_url };
}

const issuePath = (target: Record<string, unknown>, externalId: string) => `${API}/repos/${target.repo}/issues/${externalId.replace(/^#/, "")}`;

const labelsOf = (target: Record<string, unknown>) => (Array.isArray(target.labels) ? (target.labels as string[]).filter(Boolean).slice(0, 10) : []);

export const github: Provider = {
  id: "github",
  name: "GitHub Issues",
  kind: "tracker",
  category: "tracker",
  summary: "Opens an issue in a repository for each new report.",
  targetLabel: "Repository",
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => "https://github.com/login/oauth/authorize",
    tokenUrl: () => "https://github.com/login/oauth/access_token",
    scopes: ["repo"],
    clientId: () => config.oauth.github.clientId,
    clientSecret: () => config.oauth.github.clientSecret,
    async complete(token) {
      const accessToken = String(token.access_token);
      return { credentials: { accessToken }, account: await account(accessToken) };
    },
  },
  tokenFields: [
    {
      key: "token",
      label: "Personal access token",
      placeholder: "github_pat_…",
      secret: true,
      hint: "A fine-grained token with Issues set to read and write on the repositories you'll use.",
    },
  ],
  tokenHelp: { text: "Create a token on GitHub", url: "https://github.com/settings/personal-access-tokens/new" },
  async connectWithToken(fields) {
    const accessToken = fields.token.trim();
    return { credentials: { accessToken }, account: await account(accessToken) };
  },
  async validate(conn) {
    return account(await conn.accessToken());
  },
  async listTargets(conn) {
    const token = await conn.accessToken();
    const { data } = await request<any[]>("GitHub", `${API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, {
      headers: headers(token),
    });
    return data
      .filter((r) => r.has_issues && !r.archived)
      .map((r) => ({ id: String(r.id), label: r.full_name, hint: r.private ? "Private" : "Public", value: { repo: r.full_name } }));
  },
  async deliver({ report, target, connection }) {
    const token = await connection!.accessToken();
    const { data, status } = await request("GitHub", `${API}/repos/${target.repo}/issues`, {
      method: "POST",
      headers: headers(token),
      json: { title: issueTitle(report), body: markdownBody(report), labels: labelsOf(target) },
      thing: "repository",
    });
    return { externalId: `#${data.number}`, externalUrl: data.html_url, responseStatus: status };
  },
  async comment(issue, markdown) {
    const token = await issue.connection.accessToken();
    const { data, status } = await request("GitHub", `${issuePath(issue.target, issue.externalId)}/comments`, { method: "POST", headers: headers(token), json: { body: markdown }, thing: "issue" });
    return { externalId: issue.externalId, externalUrl: data.html_url ?? issue.externalUrl ?? undefined, responseStatus: status };
  },
  async issueState(issue) {
    const { data } = await request("GitHub", issuePath(issue.target, issue.externalId), { headers: headers(await issue.connection.accessToken()), thing: "issue" });
    if (data.state !== "closed") return "open";
    return data.state_reason === "not_planned" || data.state_reason === "duplicate" ? "closed" : "resolved";
  },
};
