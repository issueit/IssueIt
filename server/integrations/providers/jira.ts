import { config } from "../../config";
import type { ConnectionAccount } from "../../db/schema";
import { facts, formatBytes, issueTitle } from "../format";
import { bearer, IntegrationError, request } from "../http";
import type { ConnectionHandle, Credentials, Provider, ReportPayload } from "../types";

/**
 * Jira Cloud. OAuth connections talk to api.atlassian.com with a cloud id;
 * API-token connections talk to the site directly with basic auth.
 */
const SITE = /^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net$/;

async function endpoint(conn: { credentials: Credentials; accessToken(): Promise<string> }) {
  const c = conn.credentials;
  if (c.kind === "apiToken") {
    return { base: String(c.siteUrl), headers: { authorization: `Basic ${Buffer.from(`${c.email}:${c.accessToken}`).toString("base64")}` } };
  }
  return { base: `https://api.atlassian.com/ex/jira/${c.cloudId}`, headers: bearer(await conn.accessToken()) };
}

async function account(conn: { credentials: Credentials; accessToken(): Promise<string> }): Promise<ConnectionAccount> {
  const { base, headers } = await endpoint(conn);
  const { data } = await request("Jira", `${base}/rest/api/3/myself`, { headers });
  const site = String(conn.credentials.siteUrl);
  return { label: `${new URL(site).hostname} · ${data.displayName}`, url: site, avatarUrl: data.avatarUrls?.["48x48"] };
}

const node = (type: string, content: object[], extra: object = {}) => ({ type, content, ...extra });
const t = (text: string, href?: string, bold = false) => ({
  type: "text",
  text,
  ...(href || bold ? { marks: [...(href ? [{ type: "link", attrs: { href } }] : []), ...(bold ? [{ type: "strong" }] : [])] } : {}),
});

/** Atlassian Document Format: paragraphs, then the facts as a list, then links. */
function adf(r: ReportPayload) {
  const paragraphs = (r.description.trim() || "No description provided.")
    .split(/\n{2,}/)
    .slice(0, 50)
    .map((p) => node("paragraph", [t(p.slice(0, 5000))]));
  const list = node(
    "bulletList",
    facts(r).map(([k, v]) => node("listItem", [node("paragraph", [t(`${k}: `, undefined, true), t(v)])])),
  );
  const links = r.attachments.map((a) => node("paragraph", [t(`${a.filename} (${formatBytes(a.sizeBytes)})`, a.url)]));
  return { type: "doc", version: 1, content: [...paragraphs, { type: "rule" }, list, ...links, node("paragraph", [t("View in Issueit", r.dashboardUrl)])] };
}

/** Markdown as plain ADF paragraphs: bold markers dropped, [text](url) kept as links. */
function adfFromMarkdown(markdown: string) {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .slice(0, 40)
    .map((block) => {
      const parts: object[] = [];
      const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
      let last = 0;
      for (let m = re.exec(block); m; m = re.exec(block)) {
        if (m.index > last) parts.push(t(block.slice(last, m.index).replace(/\*\*/g, "")));
        parts.push(t(m[1], m[2]));
        last = m.index + m[0].length;
      }
      if (last < block.length) parts.push(t(block.slice(last).replace(/\*\*/g, "")));
      return node("paragraph", parts.length ? parts : [t(" ")]);
    });
  return { type: "doc", version: 1, content: paragraphs };
}

async function issueType(base: string, headers: Record<string, string>, projectKey: string): Promise<string> {
  const { data } = await request("Jira", `${base}/rest/api/3/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`, { headers, thing: "project" });
  const types: any[] = (data.issueTypes ?? data.values ?? []).filter((x: any) => !x.subtask);
  const pick = types.find((x) => x.name === "Bug") ?? types.find((x) => x.name === "Task") ?? types[0];
  if (!pick) throw new IntegrationError("That Jira project has no issue types Issueit can use.", { retryable: false });
  return pick.id;
}

export const jira: Provider = {
  id: "jira",
  name: "Jira",
  kind: "tracker",
  category: "tracker",
  summary: "Creates a Jira Cloud issue, as a Bug where the project has one, for each new report.",
  targetLabel: "Project",
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => "https://auth.atlassian.com/authorize",
    tokenUrl: () => "https://auth.atlassian.com/oauth/token",
    scopes: ["read:jira-work", "write:jira-work", "read:jira-user", "offline_access"],
    tokenRequest: "json",
    extraParams: { audience: "api.atlassian.com", prompt: "consent" },
    clientId: () => config.oauth.jira.clientId,
    clientSecret: () => config.oauth.jira.clientSecret,
    async complete(token) {
      const accessToken = String(token.access_token);
      const { data } = await request<any[]>("Jira", "https://api.atlassian.com/oauth/token/accessible-resources", { headers: bearer(accessToken) });
      const site = data.find((s) => (s.scopes ?? []).includes("write:jira-work")) ?? data[0];
      if (!site) throw new IntegrationError("That Atlassian account has no Jira sites Issueit can use.", { retryable: false });
      const credentials: Credentials = {
        kind: "oauth",
        accessToken,
        refreshToken: token.refresh_token as string | undefined,
        expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : undefined,
        cloudId: site.id,
        siteUrl: site.url,
      };
      return { credentials, account: await account({ credentials, accessToken: async () => accessToken }) };
    },
  },
  tokenFields: [
    { key: "siteUrl", label: "Jira site", placeholder: "https://your-team.atlassian.net" },
    { key: "email", label: "Atlassian email", placeholder: "you@example.com" },
    { key: "token", label: "API token", secret: true, placeholder: "ATATT…", hint: "Jira Cloud only. The account needs permission to create issues." },
  ],
  tokenHelp: { text: "Create an Atlassian API token", url: "https://id.atlassian.com/manage-profile/security/api-tokens" },
  async connectWithToken(fields) {
    const siteUrl = fields.siteUrl.trim().replace(/\/+$/, "");
    if (!SITE.test(siteUrl)) throw new IntegrationError("Enter your Jira Cloud address, like https://your-team.atlassian.net.", { retryable: false });
    const credentials: Credentials = { kind: "apiToken", siteUrl, email: fields.email.trim(), accessToken: fields.token.trim() };
    return { credentials, account: await account({ credentials, accessToken: async () => String(credentials.accessToken) }) };
  },
  async validate(conn) {
    return account(conn);
  },
  async listTargets(conn) {
    const { base, headers } = await endpoint(conn);
    const { data } = await request("Jira", `${base}/rest/api/3/project/search?maxResults=100&orderBy=name`, { headers });
    return (data.values ?? []).map((p: any) => ({ id: p.id, label: p.name, hint: p.key, value: { projectId: p.id, projectKey: p.key, projectName: p.name } }));
  },
  async deliver({ report, target, connection }) {
    const conn = connection as ConnectionHandle;
    const { base, headers } = await endpoint(conn);
    const typeId = await issueType(base, headers, String(target.projectKey));
    const { data, status } = await request("Jira", `${base}/rest/api/3/issue`, {
      method: "POST",
      headers,
      json: { fields: { project: { id: target.projectId }, issuetype: { id: typeId }, summary: issueTitle(report).slice(0, 254), description: adf(report) } },
      thing: "project",
    });
    return { externalId: data.key, externalUrl: `${conn.credentials.siteUrl}/browse/${data.key}`, responseStatus: status };
  },
  async comment(issue, markdown) {
    const { base, headers } = await endpoint(issue.connection);
    const { status } = await request("Jira", `${base}/rest/api/3/issue/${encodeURIComponent(issue.externalId)}/comment`, {
      method: "POST",
      headers,
      json: { body: adfFromMarkdown(markdown) },
      thing: "issue",
    });
    return { externalId: issue.externalId, externalUrl: issue.externalUrl ?? undefined, responseStatus: status };
  },
  async issueState(issue) {
    const { base, headers } = await endpoint(issue.connection);
    const { data } = await request("Jira", `${base}/rest/api/3/issue/${encodeURIComponent(issue.externalId)}?fields=status,resolution`, { headers, thing: "issue" });
    if (data.fields?.status?.statusCategory?.key !== "done") return "open";
    return /won.?t|duplicate|cannot|declined|not a bug|invalid/i.test(String(data.fields?.resolution?.name ?? "")) ? "closed" : "resolved";
  },
};
