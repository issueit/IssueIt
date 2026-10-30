/** Shapes returned by the dashboard API. */

export type Role = "owner" | "member";
export type ReportStatus = "new" | "investigating" | "resolved" | "closed";
export type Priority = "low" | "medium" | "high" | "critical";
export type DeliveryStatus = "pending" | "delivering" | "delivered" | "retrying" | "failed";
export type WebhookEvent = "report.created" | "report.updated" | "report.resolved" | "report.closed" | "report.duplicate";

export type Me = {
  user: { id: string; name: string; email: string; createdAt: string };
  organisations: Array<{ id: string; name: string; role: Role }>;
};

export type WidgetField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "email" | "url" | "number";
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
};

export type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left" | "middle-right" | "middle-left";
export type FieldMode = "off" | "optional" | "required";

/** Mirrors server/db/schema.ts. The server fills in defaults for older projects. */
export type WidgetConfig = {
  showButton: boolean;
  buttonLabel: string;
  buttonIcon: "bug" | "chat" | "flag" | "help" | "logo" | "none";
  buttonStyle: "pill" | "square" | "icon";
  buttonSize: "sm" | "md" | "lg";
  position: WidgetPosition;
  offsetX: number;
  offsetY: number;
  theme: "auto" | "light" | "dark";
  accent: string | null;
  radius: number;
  panelWidth: number;
  font: "system" | "inherit";
  shadow: "none" | "soft" | "strong";
  backdrop: boolean;
  /** Path of the uploaded logo, /v1/prj_…/logo?v=…. */
  logo: string | null;
  brandName: string;
  headerStyle: "plain" | "filled";
  poweredBy: boolean;
  title: string;
  intro: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  footerNote: string;
  privacyUrl: string | null;
  updatesLabel: string;
  duplicateMessage: string;
  collectEmail: FieldMode;
  collectName: FieldMode;
  descriptionRequired: boolean;
  askPriority: boolean;
  defaultPriority: Priority;
  categories: string[];
  categoryLabel: string;
  customFields: WidgetField[];
  allowAttachments: boolean;
  allowScreenshot: boolean;
  maxFiles: number;
  shortcut: string | null;
  autoCloseSeconds: number;
  hideOnMobile: boolean;
  includePages: string[];
  excludePages: string[];
  sendContext: boolean;
  captureConsole: boolean;
  captureNetwork: boolean;
  captureSteps: boolean;
  environment: string | null;
};

/** Emails to the people who send reports. Mirrors server/db/schema.ts. */
export type ProjectEmailSettings = {
  enabled: boolean;
  receipt: boolean;
  resolved: boolean;
  sender: "issueit" | "connection";
  connectionId: string | null;
  fromName: string;
  replyTo: string | null;
  receiptMessage: string;
  resolvedMessage: string;
};

/** Whether this server can send email itself. */
export type MailInfo = { issueit: boolean; from: string | null };

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  lastReportAt: string | null;
  reportCount: number;
  newCount: number;
  destinationCount: number;
  failingCount: number;
};

export type Project = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  publicSubmissions: boolean;
  allowedOrigins: string[];
  widget: WidgetConfig;
  emails: ProjectEmailSettings;
  groupDuplicates: boolean;
  lastReportAt: string | null;
  createdAt: string;
};

export type ProjectLinks = { endpoint: string; formUrl: string; widgetUrl: string; docsUrl: string };

export type ReportListItem = {
  id: string;
  number: number;
  title: string;
  status: ReportStatus;
  priority: Priority;
  source: string;
  environment: string | null;
  reporterEmail: string | null;
  createdAt: string;
  projectId: string;
  projectName: string;
  attachmentCount: number;
  delivered: number;
  failed: number;
  pending: number;
  /** Other reports that joined this one. */
  duplicateCount: number;
  lastSeenAt: string | null;
};

export type ConsoleEntry = { t: number; level: "error" | "warn" | "info" | "log"; message: string; stack?: string };
export type NetworkEntry = { t: number; method: string; url: string; status: number | null; ms: number; error?: string };
export type StepEntry = { t: number; kind: "click" | "navigate" | "input"; label: string };
export type Diagnostics = { console?: ConsoleEntry[]; network?: NetworkEntry[]; steps?: StepEntry[] };

export type ReporterEmail = {
  id: string;
  kind: "receipt" | "resolved";
  to: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type ReportDetail = {
  report: {
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
    context: Record<string, string | undefined>;
    reporterEmail: string | null;
    reporterName: string | null;
    metadata: Record<string, unknown>;
    diagnostics: Diagnostics;
    notifyReporter: boolean;
    groupId: string | null;
    duplicateCount: number;
    lastSeenAt: string | null;
    resolvedAt: string | null;
    createdAt: string;
    updatedAt: string;
    projectId: string;
    project: { id: string; name: string };
  };
  /** The report this one joined, when it's a duplicate. */
  group: { id: string; number: number; title: string; status: ReportStatus; duplicateCount: number } | null;
  duplicates: Array<{ id: string; number: number; title: string; reporterEmail: string | null; reporterName: string | null; pageUrl: string | null; browser: string | null; createdAt: string }>;
  emails: ReporterEmail[];
  attachments: Array<{ id: string; filename: string; contentType: string; sizeBytes: number; createdAt: string }>;
  deliveries: Array<{
    id: string;
    event: string;
    status: DeliveryStatus;
    attempts: number;
    lastError: string | null;
    externalId: string | null;
    externalUrl: string | null;
    externalState: "open" | "resolved" | "closed" | null;
    nextAttemptAt: string;
    deliveredAt: string | null;
    createdAt: string;
    destinationId: string;
    destinationName: string;
    provider: string;
  }>;
};

export type TokenField = { key: string; label: string; hint?: string; placeholder?: string; secret?: boolean; optional?: boolean };

export type ProviderCategory = "tracker" | "helpdesk" | "chat" | "notify" | "email" | "oncall" | "data" | "automation" | "analytics" | "cloud" | "webhook";

export type ProviderInfo = {
  id: string;
  name: string;
  kind: "tracker" | "chat" | "webhook";
  category: ProviderCategory;
  keywords: string[];
  summary: string;
  targetLabel: string | null;
  /** Typed in on the set-up step when the service can't list its targets. */
  targetFields: TokenField[];
  /** The service offers sign-in, whether or not this server has it set up. */
  oauthPossible: boolean;
  events: WebhookEvent[];
  oauth: boolean;
  tokenFields: TokenField[];
  tokenHelp: { text: string; url: string } | null;
  needsConnection: boolean;
  canComment: boolean;
  canSync: boolean;
};

export type Connection = {
  id: string;
  provider: string;
  authType: "oauth" | "token";
  account: { label: string; url?: string; avatarUrl?: string; extra?: Record<string, string> };
  status: "active" | "error";
  lastError: string | null;
  createdAt: string;
  destinationCount?: number;
};

export type RoutingRule = { priorities?: Priority[]; sources?: string[]; environments?: string[] };

export type DeliveryPolicy = {
  maxAttempts: number;
  backoff: "standard" | "exponential" | "linear" | "fixed";
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  timeoutSeconds: number;
  respectRetryAfter: boolean;
  retryServerErrors: boolean;
  retryRateLimits: boolean;
  retryNetworkErrors: boolean;
  retryClientErrors: boolean;
  sendDelaySeconds: number;
  rateLimitPerMinute: number;
  autoPauseAfter: number;
  titlePrefix: string;
  includeDescription: boolean;
  includeContext: boolean;
  includeMetadata: boolean;
  includeAttachments: boolean;
  includeReporter: boolean;
  includeDiagnostics: boolean;
};

export type OrgSettings = { delivery?: Partial<DeliveryPolicy>; location?: "auto" | "timezone" | "off" };

export type Destination = {
  id: string;
  provider: string;
  connectionId: string | null;
  name: string;
  target: Record<string, unknown>;
  enabled: boolean;
  events: WebhookEvent[];
  rule: RoutingRule;
  policy: Partial<DeliveryPolicy>;
  pausedReason: string | null;
  syncState: boolean;
  webhookHost: string | null;
  headerNames: string[];
  createdAt: string;
  projectId: string;
  projectName: string;
  connection: Connection | null;
  stats: {
    delivered: number;
    failed: number;
    pending: number;
    weekDelivered: number;
    weekFailed: number;
    avgMs: number | null;
    lastStatus: DeliveryStatus | null;
    lastAt: string | null;
    lastError: string | null;
  };
};

export type TargetOption = { id: string; label: string; hint?: string; value: Record<string, unknown> };

export type DeliveryRow = {
  id: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  responseStatus: number | null;
  externalId: string | null;
  externalUrl: string | null;
  isTest: boolean;
  nextAttemptAt: string;
  deliveredAt: string | null;
  createdAt: string;
  reportId: string | null;
  reportTitle: string | null;
  destinationId: string;
  destinationName: string;
  provider: string;
  durationMs: number | null;
  projectId: string;
};

export type AttemptLogEntry = { at: string; ok: boolean; ms: number; status?: number | null; error?: string | null };

export type DeliveryDetail = Omit<DeliveryRow, "reportTitle"> & {
  updatedAt: string;
  attemptLog: AttemptLogEntry[];
  payload: Record<string, unknown> | null;
  reportTitle: string | null;
  reportNumber: number | null;
};

export type AnalyticsRange = "24h" | "7d" | "30d" | "90d" | "12m";
export type Count = { key: string; n: number };

export type Analytics = {
  range: AnalyticsRange;
  unit: "hour" | "day" | "week" | "month";
  timezone: string;
  totals: {
    reports: number;
    previousReports: number;
    open: number;
    resolved: number;
    withAttachments: number;
    reporters: number;
    delivered: number;
    failed: number;
    waiting: number;
    avgDeliveryMs: number | null;
    p50DeliveryMs: number | null;
    p95DeliveryMs: number | null;
    failingDestinations: number;
  };
  series: Array<{ bucket: string } & Record<Priority, number>>;
  previousSeries: number[];
  deliverySeries: Array<{ bucket: string; delivered: number; failed: number; waiting: number }>;
  breakdowns: {
    status: Count[];
    priority: Count[];
    source: Count[];
    environment: Count[];
    browser: Count[];
    os: Count[];
    device: Count[];
    country: Count[];
    page: Count[];
    project: Array<Count & { name: string }>;
    provider: Array<{ key: string; delivered: number; failed: number }>;
  };
  heatmap: Array<{ dow: number; hour: number; n: number }>;
};
