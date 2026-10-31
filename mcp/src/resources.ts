import type { IssueitClient } from "./client";
import { renderReport, reportTable, type ReportDetail, type ReportListItem } from "./render";

/**
 * Resources are things a person can attach to a conversation by hand, rather
 * than tools a model calls: a bug report to paste in, a project's settings,
 * and the API reference, so nobody has to guess at an endpoint.
 */

export const docs = {
  uri: "issueit://docs/api",
  name: "Issueit API reference",
  description: "How reports get in, what a webhook carries, and how the management API is authenticated.",
  text: () => API_REFERENCE,
};

export async function openReports(c: IssueitClient): Promise<string> {
  const { reports } = await c.get<{ reports: ReportListItem[] }>("/reports?status=open&limit=50");
  return `# Open bug reports\n\n${reportTable(reports)}`;
}

export async function reportResource(c: IssueitClient, id: string): Promise<string> {
  const detail = await c.get<ReportDetail>(`/reports/${id}`);
  const { urls } = await c.whoami();
  return renderReport(detail, urls.app);
}

export async function projectResource(c: IssueitClient, id: string): Promise<string> {
  const detail = await c.get<{ project: Record<string, any>; links: Record<string, string>; stats: Record<string, number> }>(`/projects/${id}`);
  return JSON.stringify(detail, null, 2);
}

const API_REFERENCE = `# Issueit API

Issueit collects bug reports and delivers them elsewhere. It is not an issue tracker.
There are two APIs and three kinds of credential, and mixing them up is the usual mistake.

## Credentials

| Credential | Looks like | Use it for | Safe in a browser |
| --- | --- | --- | --- |
| Project id | \`prj_…\` | Identifying a project when a browser sends a report | Yes |
| Project secret key | \`sk_live_…\` | Sending reports from your own server | **No** |
| Account token | \`ak_live_…\` | The management API: this MCP server, the CLI, CI | **No** |

A secret key can only create reports. An account token carries scopes and can read and
change the organisation, but can never mint another token.

## Sending a report

\`POST {drop}/v1/{project_id}/reports\`, JSON or multipart.

\`\`\`json
{
  "title": "Login button does nothing",
  "description": "Clicking login does nothing.",
  "severity": "high",
  "environment": "production",
  "page_url": "https://example.com/login",
  "email": "jo@example.com",
  "metadata": { "user_id": "user_123" },
  "fingerprint": "login-submit-null-ref"
}
\`\`\`

- From a browser, send the project id alone and no \`Authorization\` header. The project's
  allowed sites decide whether it is accepted.
- From a server, send \`Authorization: Bearer sk_live_…\`. Secret keys are refused when the
  request carries a browser \`Origin\`, because that means the key has leaked.
- \`fingerprint\` is your own grouping key. Reports that share one are treated as the same
  bug: the second onwards join the first instead of being delivered again.
- Attachments go as multipart files, or as base64 in \`attachments[]\`.

## Webhooks

A webhook destination receives:

\`\`\`json
{ "event": "report.created", "created_at": "…", "data": { "report": { "…": "…" } } }
\`\`\`

Each request carries \`issueit-signature: t=<unix seconds>,v1=<hex>\`, an HMAC-SHA256 of
\`\${t}.\${rawBody}\` with the destination's signing secret. Compare it in constant time and
reject anything older than a few minutes. Retries send identical bytes, so a replay guard
should key on the delivery's idempotency, not the body.

## The management API

Everything the dashboard does, at \`{app}/api/orgs/current/…\`, with
\`Authorization: Bearer ak_live_…\`. \`current\` resolves to the token's own organisation.

- \`GET /whoami\` — the token's organisation, scopes and projects
- \`GET /reports\` — \`project\`, \`status\`, \`priority\`, \`q\`, \`since\`, \`number\`, \`cursor\`
- \`GET /reports/{id}\` — one report with diagnostics, attachments and deliveries
- \`PATCH /reports/{id}\` — \`status\`, \`priority\`
- \`GET|POST /projects\`, \`PATCH /projects/{id}\`
- \`GET|POST /projects/{id}/destinations\`, \`POST …/{dst}/test\`
- \`GET /deliveries\`, \`POST /deliveries/{id}/retry\`, \`POST /deliveries/retry-failed\`
- \`GET /analytics?range=30d\`, \`GET /usage\`, \`GET /audit\`

Errors are \`{ "error": { "code": "…", "message": "…" } }\` with a message fit to show a person.
A missing scope is a 403 naming the scope it wanted.
`;
