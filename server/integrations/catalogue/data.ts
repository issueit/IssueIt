import { environmentLine, plainBody, priorityLabel, titleFor } from "../format";
import { bearer, IntegrationError } from "../http";
import type { Provider, ReportPayload } from "../types";
import { baseUrl, call, define, optional, secret, seg, text, type Spec } from "./define";
import { googleToken } from "./signing";

/** Spreadsheets and databases: each new report becomes a row. */

const titleColumn = optional(text("titleField", "Title column", "The column that gets the report title.", "Name"));
const bodyColumn = optional(text("bodyField", "Description column", "Leave empty to skip the description."));

/** The common row shape: title plus optional description, keyed by the person's column names. */
function row(report: ReportPayload, target: Record<string, string>, isTest: boolean, defaultTitle = "Name") {
  const fields: Record<string, string> = { [target.titleField || defaultTitle]: titleFor(report, isTest) };
  if (target.bodyField) fields[target.bodyField] = plainBody(report, 50_000);
  return fields;
}

const specs: Spec[] = [
  {
    id: "airtable",
    name: "Airtable",
    category: "data",
    summary: "Adds a record to an Airtable table for each new report.",
    fields: [secret("token", "Personal access token", "With data.records:write on the base.")],
    help: { text: "Create a personal access token", url: "https://airtable.com/create/tokens" },
    target: { label: "Table", fields: [text("base", "Base ID", "From the base's URL, starts with app.", "app…"), text("table", "Table name or ID"), titleColumn, bodyColumn] },
    async check(creds) {
      const { data } = await call("Airtable", "https://api.airtable.com/v0/meta/whoami", { headers: bearer(creds.token) });
      return { label: data.email ?? data.id };
    },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Airtable", `https://api.airtable.com/v0/${seg(target.base)}/${seg(target.table)}`, {
        method: "POST",
        headers: bearer(creds.token),
        json: { records: [{ fields: row(report, target, isTest) }], typecast: true },
        thing: "table",
      });
      return { externalId: data.records?.[0]?.id, externalUrl: data.records?.[0]?.id ? `https://airtable.com/${target.base}/${data.records[0].id}` : undefined, responseStatus: status };
    },
  },
  {
    id: "smartsheet",
    name: "Smartsheet",
    category: "data",
    summary: "Adds a row to the top of a Smartsheet sheet for each new report.",
    fields: [
      secret("token", "API access token", "In Smartsheet, open Apps & integrations, then API access."),
      optional(text("host", "API host", "api.smartsheet.eu for EU accounts.", "api.smartsheet.com")),
    ],
    target: { label: "Sheet", fields: [text("sheet", "Sheet ID", "In the sheet, open File, then Properties."), bodyColumn] },
    async check(creds) {
      const { data } = await call("Smartsheet", `https://${creds.host || "api.smartsheet.com"}/2.0/users/me`, { headers: bearer(creds.token) });
      return { label: data.email };
    },
    async send({ report, creds, target, isTest }) {
      const api = `https://${creds.host || "api.smartsheet.com"}/2.0/sheets/${seg(target.sheet)}`;
      const { data: sheet } = await call("Smartsheet", `${api}?pageSize=1&include=objectValue`, { headers: bearer(creds.token), thing: "sheet" });
      const primary = sheet.columns?.find((c: any) => c.primary);
      if (!primary) throw new IntegrationError("Smartsheet didn't return the sheet's primary column.", { retryable: false });
      const cells: Array<{ columnId: number; value: string }> = [{ columnId: primary.id, value: titleFor(report, isTest) }];
      const body = target.bodyField && sheet.columns.find((c: any) => c.title.toLowerCase() === target.bodyField.toLowerCase());
      if (body) cells.push({ columnId: body.id, value: plainBody(report, 3900) });
      const { data, status } = await call("Smartsheet", `${api}/rows`, { method: "POST", headers: bearer(creds.token), json: [{ toTop: true, cells }] });
      return { externalId: String(data.result?.[0]?.id ?? ""), externalUrl: sheet.permalink, responseStatus: status };
    },
  },
  {
    id: "coda",
    name: "Coda",
    category: "data",
    summary: "Adds a row to a Coda table for each new report.",
    fields: [secret("token", "API token", "In Coda, open Account settings, then API settings.")],
    target: { label: "Table", fields: [text("doc", "Doc ID", "The part of the doc URL after _d.", "AbCDeFGH"), text("table", "Table name or ID"), titleColumn, bodyColumn] },
    async check(creds) {
      const { data } = await call("Coda", "https://coda.io/apis/v1/whoami", { headers: bearer(creds.token) });
      return { label: data.name ?? data.loginId };
    },
    async send({ report, creds, target, isTest }) {
      const cells = Object.entries(row(report, target, isTest)).map(([column, value]) => ({ column, value }));
      const { data, status } = await call("Coda", `https://coda.io/apis/v1/docs/${seg(target.doc)}/tables/${seg(target.table)}/rows`, {
        method: "POST",
        headers: bearer(creds.token),
        json: { rows: [{ cells }] },
        thing: "table",
      });
      return { externalId: data.addedRowIds?.[0], responseStatus: status };
    },
  },
  {
    id: "baserow",
    name: "Baserow",
    category: "data",
    summary: "Adds a row to a Baserow table for each new report.",
    fields: [optional(text("url", "Baserow URL", "Only for self-hosted Baserow.", "https://api.baserow.io")), secret("token", "Database token", "In Baserow, open Settings, then Database tokens.")],
    target: { label: "Table", fields: [text("table", "Table ID", "The number in the table's URL."), titleColumn, bodyColumn] },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Baserow", `${baseUrl(creds.url || "https://api.baserow.io")}/api/database/rows/table/${seg(target.table)}/?user_field_names=true`, {
        method: "POST",
        headers: { authorization: `Token ${creds.token}` },
        json: row(report, target, isTest),
        thing: "table",
      });
      return { externalId: `#${data.id}`, responseStatus: status };
    },
  },
  {
    id: "nocodb",
    name: "NocoDB",
    category: "data",
    summary: "Adds a record to a NocoDB table for each new report.",
    fields: [optional(text("url", "NocoDB URL", "Only for self-hosted NocoDB.", "https://app.nocodb.com")), secret("token", "API token", "In NocoDB, open Account, then Tokens.")],
    target: { label: "Table", fields: [text("table", "Table ID"), titleColumn, bodyColumn] },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("NocoDB", `${baseUrl(creds.url || "https://app.nocodb.com")}/api/v2/tables/${seg(target.table)}/records`, {
        method: "POST",
        headers: { "xc-token": creds.token },
        json: row(report, target, isTest, "Title"),
        thing: "table",
      });
      return { externalId: String(data.Id ?? data.id ?? ""), responseStatus: status };
    },
  },
  {
    id: "grist",
    name: "Grist",
    category: "data",
    summary: "Adds a record to a Grist table for each new report.",
    fields: [optional(text("url", "Grist URL", "Your team site or self-hosted address.", "https://docs.getgrist.com")), secret("token", "API key", "In Grist, open Profile settings, then API.")],
    target: { label: "Table", fields: [text("doc", "Document ID", "From Document settings."), text("table", "Table ID", undefined, "Table1"), titleColumn, bodyColumn] },
    async check(creds) {
      const { data } = await call("Grist", `${baseUrl(creds.url || "https://docs.getgrist.com")}/api/profile/user`, { headers: bearer(creds.token) });
      return { label: data.name ?? data.email ?? "Grist" };
    },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Grist", `${baseUrl(creds.url || "https://docs.getgrist.com")}/api/docs/${seg(target.doc)}/tables/${seg(target.table)}/records`, {
        method: "POST",
        headers: bearer(creds.token),
        json: { records: [{ fields: row(report, target, isTest, "Title") }] },
        thing: "table",
      });
      return { externalId: String(data.records?.[0]?.id ?? ""), responseStatus: status };
    },
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "data",
    keywords: ["postgres", "postgrest"],
    summary: "Inserts a row into a Supabase table for each new report.",
    fields: [text("url", "Project URL", undefined, "https://abcd.supabase.co"), secret("token", "Service role or secret key", "Bypasses row level security, so keep it to this table if you can.")],
    target: {
      label: "Table",
      fields: [
        text("table", "Table", undefined, "bug_reports"),
        optional(text("titleField", "Title column", undefined, "title")),
        bodyColumn,
        optional(text("jsonField", "JSON column", "A jsonb column for the whole report. Leave empty to skip.")),
      ],
    },
    async send({ report, creds, target, isTest }) {
      const fields: Record<string, unknown> = row(report, { ...target, titleField: target.titleField || "title" }, isTest);
      if (target.jsonField) fields[target.jsonField] = report;
      const { status } = await call("Supabase", `${baseUrl(creds.url)}/rest/v1/${seg(target.table)}`, {
        method: "POST",
        headers: { apikey: creds.token, ...bearer(creds.token), prefer: "return=minimal" },
        json: fields,
        thing: "table",
      });
      return { responseStatus: status };
    },
  },
  {
    id: "googlesheets",
    name: "Google Sheets",
    category: "data",
    keywords: ["spreadsheet", "google"],
    summary: "Appends a row to a Google Sheet for each new report.",
    fields: [secret("serviceAccount", "Service account key", "Paste the JSON key file. Then share the sheet with the service account's email as an editor.")],
    help: { text: "Create a service account key", url: "https://cloud.google.com/iam/docs/keys-create-delete" },
    target: {
      label: "Sheet",
      fields: [text("spreadsheet", "Spreadsheet ID", "The long id in the sheet's URL, between /d/ and /edit."), optional(text("tab", "Tab name", "Leave empty for the first tab.", "Sheet1"))],
    },
    check(creds) {
      try {
        return { label: JSON.parse(creds.serviceAccount).client_email };
      } catch {
        throw new IntegrationError("Paste the whole service account key file, the JSON that starts with {.", { retryable: false });
      }
    },
    async send({ report, creds, target, isTest }) {
      const token = await googleToken(creds.serviceAccount, "https://www.googleapis.com/auth/spreadsheets");
      const range = encodeURIComponent(target.tab ? `'${target.tab.replace(/'/g, "''")}'!A1` : "A1");
      const values = [
        [
          report.createdAt,
          report.number,
          titleFor(report, isTest),
          priorityLabel[report.priority],
          report.source,
          report.environment ?? "",
          report.pageUrl ?? "",
          environmentLine(report) ?? "",
          report.reporter.email ?? "",
          report.dashboardUrl,
        ],
      ];
      const { data, status } = await call(
        "Google Sheets",
        `https://sheets.googleapis.com/v4/spreadsheets/${seg(target.spreadsheet)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: bearer(token),
          json: { values },
          thing: "spreadsheet",
        },
      );
      return { externalId: data.updates?.updatedRange, externalUrl: `https://docs.google.com/spreadsheets/d/${target.spreadsheet}`, responseStatus: status };
    },
  },
];

export const dataStores: Provider[] = specs.map(define);
