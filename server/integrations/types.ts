import type { ConnectionAccount, Diagnostics, Priority, ReportContext, ReportStatus, WebhookEvent } from "../db/schema";

/** Provider ids are stable strings stored on connections and destinations. */
export type ProviderId = string;

/** Groups for the destination picker. */
export const categories = ["tracker", "helpdesk", "chat", "notify", "email", "oncall", "data", "automation", "analytics", "cloud", "webhook"] as const;
export type Category = (typeof categories)[number];

/** Decrypted connection credentials. OAuth tokens plus anything provider-specific. */
export type Credentials = {
  accessToken?: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
  [key: string]: unknown;
};

/** A field a person fills in to connect without OAuth. */
export type TokenField = {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
};

export type TargetOption = {
  id: string;
  label: string;
  hint?: string;
  /** Stored as the destination's target. Never secret. */
  value: Record<string, unknown>;
};

export type AttachmentPayload = { id: string; filename: string; contentType: string; sizeBytes: number; url: string };

/** Everything a provider needs to describe a report. */
export type ReportPayload = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: ReportStatus;
  priority: Priority;
  source: string;
  environment: string | null;
  pageUrl: string | null;
  browser: string | null;
  context: ReportContext;
  reporter: { email: string | null; name: string | null };
  metadata: Record<string, unknown>;
  diagnostics: Diagnostics;
  attachments: AttachmentPayload[];
  /** Set when this report joined an earlier one: that report's id, and how many reports the group holds. */
  group: { id: string; count: number } | null;
  project: { id: string; name: string };
  dashboardUrl: string;
  createdAt: string;
  updatedAt: string;
};

/** A connection with lazy token refresh. */
export type ConnectionHandle = {
  id: string;
  account: ConnectionAccount;
  credentials: Credentials;
  /** Returns a usable access token, refreshing and saving it first if it has expired. */
  accessToken(): Promise<string>;
};

export type DeliveryContext = {
  deliveryId: string;
  event: WebhookEvent;
  report: ReportPayload;
  target: Record<string, unknown>;
  connection: ConnectionHandle | null;
  secrets: Record<string, string> | null;
  /** Frozen event body for webhooks, so a retry sends the same bytes. */
  payload: Record<string, unknown> | null;
  isTest: boolean;
};

export type DeliveryResult = { externalId?: string; externalUrl?: string; responseStatus?: number };

/** An issue Issueit created earlier, as the delivery recorded it. */
export type IssueRef = { connection: ConnectionHandle; target: Record<string, unknown>; externalId: string; externalUrl: string | null };

/** Where an issue stands in its tracker. "closed" means closed without being fixed (won't fix, duplicate). */
export type IssueState = "open" | "resolved" | "closed";

export type ConnectResult = { credentials: Credentials; account: ConnectionAccount };

export type OAuthSpec = {
  authorizeUrl: () => string;
  tokenUrl: () => string;
  scopes: string[];
  scopeSeparator?: string;
  extraParams?: Record<string, string>;
  /** How the code exchange is sent. Most providers take a form body. */
  tokenRequest?: "form" | "json" | "basic-json" | "query";
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  /** Turns the token response into stored credentials and a display account. */
  complete(token: Record<string, unknown>): Promise<ConnectResult>;
};

export interface Provider {
  id: ProviderId;
  name: string;
  /** Where reports end up: an issue tracker, a chat channel, or a URL. */
  kind: "tracker" | "chat" | "webhook";
  /** Where the destination picker lists it. */
  category: Category;
  /** Searchable alternative names ("ms teams", "azure boards"). */
  keywords?: string[];
  summary: string;
  /** What a destination points at, e.g. "Repository". Null when the connection itself is the destination. */
  targetLabel: string | null;
  /** Events this provider can act on. Trackers create on report.created; webhooks take everything. */
  events: readonly WebhookEvent[];
  oauth?: OAuthSpec;
  /** Typed in when choosing where reports go, for services that can't list their targets. Not secret. */
  targetFields?: TokenField[];
  /** Manual connection, used when OAuth isn't configured on this server or isn't offered. */
  tokenFields?: TokenField[];
  tokenHelp?: { text: string; url: string };
  connectWithToken?(fields: Record<string, string>): Promise<ConnectResult>;
  /** Confirms the credentials still work and returns the current account details. */
  validate?(conn: ConnectionHandle): Promise<ConnectionAccount>;
  listTargets?(conn: ConnectionHandle): Promise<TargetOption[]>;
  deliver(ctx: DeliveryContext): Promise<DeliveryResult>;
  /** Adds a Markdown comment to an issue created earlier, e.g. when the same bug is reported again. */
  comment?(issue: IssueRef, markdown: string): Promise<DeliveryResult>;
  /** Reads an issue's state, so a report can be resolved when its issue is closed. */
  issueState?(issue: IssueRef): Promise<IssueState>;
}
