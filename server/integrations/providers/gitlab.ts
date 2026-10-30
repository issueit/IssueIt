import { config } from "../../config";
import type { ConnectionAccount } from "../../db/schema";
import { checkUrlShape } from "../../lib/ssrf";
import { issueTitle, markdownBody } from "../format";
import { bearer, IntegrationError, request } from "../http";
import type { Credentials, Provider } from "../types";

const DEFAULT = "https://gitlab.com";
const baseOf = (creds: Credentials) => String(creds.baseUrl ?? config.oauth.gitlab.baseUrl ?? DEFAULT);
/** gitlab.com is a known host; anything else is user-supplied and goes through the SSRF guard. */
const untrusted = (base: string) => base !== DEFAULT;

async function account(base: string, token: string): Promise<ConnectionAccount> {
  const { data } = await request("GitLab", `${base}/api/v4/user`, { headers: bearer(token), untrusted: untrusted(base) });
  return { label: data.username, url: data.web_url, avatarUrl: data.avatar_url, extra: base === DEFAULT ? undefined : { instance: base } };
}

const issueUrl = (base: string, target: Record<string, unknown>, externalId: string) =>
  `${base}/api/v4/projects/${encodeURIComponent(String(target.projectId))}/issues/${encodeURIComponent(externalId.replace(/^#/, ""))}`;

export const gitlab: Provider = {
  id: "gitlab",
  name: "GitLab Issues",
  kind: "tracker",
  category: "tracker",
  summary: "Opens an issue in a GitLab project for each new report.",
  targetLabel: "Project",
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => `${config.oauth.gitlab.baseUrl}/oauth/authorize`,
    tokenUrl: () => `${config.oauth.gitlab.baseUrl}/oauth/token`,
    scopes: ["api"],
    clientId: () => config.oauth.gitlab.clientId,
    clientSecret: () => config.oauth.gitlab.clientSecret,
    async complete(token) {
      const base = config.oauth.gitlab.baseUrl;
      const accessToken = String(token.access_token);
      return {
        credentials: {
          accessToken,
          refreshToken: token.refresh_token as string | undefined,
          expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : undefined,
          baseUrl: base,
        },
        account: await account(base, accessToken),
      };
    },
  },
  tokenFields: [
    { key: "token", label: "Personal access token", placeholder: "glpat-…", secret: true, hint: "A token with the api scope." },
    { key: "baseUrl", label: "GitLab address", placeholder: DEFAULT, optional: true, hint: "Leave empty for gitlab.com. Self-managed instances must be reachable from the internet." },
  ],
  tokenHelp: { text: "Create a token on GitLab", url: "https://gitlab.com/-/user_settings/personal_access_tokens?scopes=api&name=Issueit" },
  async connectWithToken(fields) {
    let base = DEFAULT;
    if (fields.baseUrl?.trim()) {
      const url = checkUrlShape(fields.baseUrl.trim());
      if (url.protocol !== "https:") throw new IntegrationError("Use an https:// address for GitLab.", { retryable: false });
      base = url.origin;
    }
    const accessToken = fields.token.trim();
    return { credentials: { accessToken, baseUrl: base }, account: await account(base, accessToken) };
  },
  async validate(conn) {
    return account(baseOf(conn.credentials), await conn.accessToken());
  },
  async listTargets(conn) {
    const base = baseOf(conn.credentials);
    const { data } = await request<any[]>("GitLab", `${base}/api/v4/projects?membership=true&min_access_level=20&per_page=100&order_by=last_activity_at&archived=false`, {
      headers: bearer(await conn.accessToken()),
      untrusted: untrusted(base),
    });
    return data
      .filter((p) => p.issues_enabled !== false)
      .map((p) => ({ id: String(p.id), label: p.path_with_namespace, hint: p.visibility, value: { projectId: p.id, path: p.path_with_namespace } }));
  },
  async deliver({ report, target, connection }) {
    const base = baseOf(connection!.credentials);
    const labels = Array.isArray(target.labels) ? (target.labels as string[]).join(",") : undefined;
    const { data, status } = await request("GitLab", `${base}/api/v4/projects/${encodeURIComponent(String(target.projectId))}/issues`, {
      method: "POST",
      headers: bearer(await connection!.accessToken()),
      json: { title: issueTitle(report), description: markdownBody(report), labels },
      untrusted: untrusted(base),
      thing: "project",
    });
    return { externalId: `#${data.iid}`, externalUrl: data.web_url, responseStatus: status };
  },
  async comment(issue, markdown) {
    const base = baseOf(issue.connection.credentials);
    const { status } = await request("GitLab", `${issueUrl(base, issue.target, issue.externalId)}/notes`, {
      method: "POST",
      headers: bearer(await issue.connection.accessToken()),
      json: { body: markdown },
      untrusted: untrusted(base),
      thing: "issue",
    });
    return { externalId: issue.externalId, externalUrl: issue.externalUrl ?? undefined, responseStatus: status };
  },
  async issueState(issue) {
    const base = baseOf(issue.connection.credentials);
    const { data } = await request("GitLab", issueUrl(base, issue.target, issue.externalId), { headers: bearer(await issue.connection.accessToken()), untrusted: untrusted(base), thing: "issue" });
    return data.state === "closed" ? "resolved" : "open";
  },
};
