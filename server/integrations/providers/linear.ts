import { config } from "../../config";
import type { ConnectionAccount, Priority } from "../../db/schema";
import { issueTitle, plainMarkdownBody } from "../format";
import { graphqlErrors, request } from "../http";
import type { ConnectionHandle, Provider } from "../types";

const API = "https://api.linear.app/graphql";

/** Personal API keys go in the header as-is; OAuth tokens are bearer tokens. */
async function authHeader(conn: ConnectionHandle) {
  const token = await conn.accessToken();
  return conn.credentials.kind === "apiKey" ? token : `Bearer ${token}`;
}

async function gql<T = any>(authorization: string, query: string, variables?: Record<string, unknown>, thing?: string): Promise<T> {
  const { data } = await request("Linear", API, { method: "POST", headers: { authorization }, json: { query, variables }, thing });
  graphqlErrors("Linear", data);
  return data.data as T;
}

async function account(authorization: string): Promise<ConnectionAccount> {
  const data = await gql(authorization, "query { viewer { name email } organization { name urlKey } }");
  return { label: `${data.organization.name} · ${data.viewer.name}`, url: `https://linear.app/${data.organization.urlKey}` };
}

const priorityMap: Record<Priority, number> = { critical: 1, high: 2, medium: 3, low: 4 };

export const linear: Provider = {
  id: "linear",
  name: "Linear",
  kind: "tracker",
  category: "tracker",
  summary: "Creates an issue in a Linear team for each new report.",
  targetLabel: "Team",
  events: ["report.created"],
  oauth: {
    authorizeUrl: () => "https://linear.app/oauth/authorize",
    tokenUrl: () => "https://api.linear.app/oauth/token",
    scopes: ["read", "write"],
    scopeSeparator: ",",
    extraParams: { prompt: "consent" },
    clientId: () => config.oauth.linear.clientId,
    clientSecret: () => config.oauth.linear.clientSecret,
    async complete(token) {
      const accessToken = String(token.access_token);
      return {
        credentials: {
          kind: "oauth",
          accessToken,
          refreshToken: token.refresh_token as string | undefined,
          expiresAt: token.expires_in ? Date.now() + Number(token.expires_in) * 1000 : undefined,
        },
        account: await account(`Bearer ${accessToken}`),
      };
    },
  },
  tokenFields: [{ key: "token", label: "Personal API key", placeholder: "lin_api_…", secret: true, hint: "From Linear settings, under Security and access." }],
  tokenHelp: { text: "Create a key in Linear", url: "https://linear.app/settings/account/security" },
  async connectWithToken(fields) {
    const accessToken = fields.token.trim();
    return { credentials: { kind: "apiKey", accessToken }, account: await account(accessToken) };
  },
  async validate(conn) {
    return account(await authHeader(conn));
  },
  async listTargets(conn) {
    const data = await gql(await authHeader(conn), "query { teams(first: 100) { nodes { id name key } } }");
    return data.teams.nodes.map((t: any) => ({ id: t.id, label: t.name, hint: t.key, value: { teamId: t.id, teamKey: t.key, teamName: t.name } }));
  },
  async deliver({ report, target, connection }) {
    const data = await gql(
      await authHeader(connection!),
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }`,
      { input: { teamId: target.teamId, title: issueTitle(report), description: plainMarkdownBody(report), priority: priorityMap[report.priority] } },
      "team",
    );
    const issue = data.issueCreate.issue;
    return { externalId: issue.identifier, externalUrl: issue.url, responseStatus: 200 };
  },
  async comment(issue, markdown) {
    const authorization = await authHeader(issue.connection);
    // Issues are found by identifier (ENG-12); comments need the issue's own id.
    const found = await gql(authorization, "query($id: String!) { issue(id: $id) { id } }", { id: issue.externalId }, "issue");
    const data = await gql(authorization, "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { url } } }", {
      input: { issueId: found.issue.id, body: markdown },
    });
    return { externalId: issue.externalId, externalUrl: data.commentCreate.comment?.url ?? issue.externalUrl ?? undefined, responseStatus: 200 };
  },
  async issueState(issue) {
    const data = await gql(await authHeader(issue.connection), "query($id: String!) { issue(id: $id) { state { type } } }", { id: issue.externalId }, "issue");
    const type = data.issue?.state?.type;
    return type === "completed" ? "resolved" : type === "canceled" ? "closed" : "open";
  },
};
