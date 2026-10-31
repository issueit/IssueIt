import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  type AnyPgColumn,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

/* ---------------------------------------------------------------- people */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** When this address was proven. Null means unverified: a nag, not a lock. */
  emailVerifiedAt: ts("email_verified_at"),
  /** Encrypted base32 TOTP secret. Present only once two-factor is set up. */
  totpSecret: text("totp_secret"),
  /** Set when the codes have been checked once, so a half-finished setup can't lock anyone out. */
  totpEnabledAt: ts("totp_enabled_at"),
  /** sha256 of each unused recovery code. */
  recoveryCodes: text("recovery_codes").array().notNull().default(sql`'{}'::text[]`),
  createdAt: created(),
  updatedAt: updated(),
});

/**
 * One-time links and codes: resetting a password, proving an address, and the
 * short window after a password check when two-factor is still to come.
 * Single use, short lived, and the token itself is never stored.
 */
export const authCodes = pgTable(
  "auth_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"reset" | "verify" | "second-factor">().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** The address being proven, for a verification of a new one. */
    email: text("email"),
    usedAt: ts("used_at"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("auth_codes_user_idx").on(t.userId, t.kind)],
)

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    createdAt: created(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Organisation-wide behaviour. Every field is optional; missing means the built-in default. */
export type OrgSettings = {
  /** Defaults for every destination; a destination's own policy wins. */
  delivery?: DeliveryPolicy;
  /** Where a report's country comes from: proxy headers then time zone, time zone only, or not at all. */
  location?: "auto" | "timezone" | "off";
  /** Delete reports entirely after this many days. 0 or missing keeps them. */
  retentionDays?: number;
};

/* ------------------------------------------------------------------ plans */

export const planIds = ["free", "solo", "team", "business"] as const;
export type PlanId = (typeof planIds)[number];

/**
 * What a plan allows. 0 means unlimited, everywhere, so a bespoke deal can
 * lift one number without listing the rest. A self-hosted install ignores
 * all of this and reads the operator's environment instead.
 */
export type PlanLimits = {
  reportsPerMonth: number;
  projects: number;
  destinationsPerProject: number;
  members: number;
  /** How long attachments and captured diagnostics are kept. */
  retentionDays: number;
  attachmentBytes: number;
  attachmentsPerReport: number;
  reportsPerKeyPerMinute: number;
  tokenRequestsPerMinute: number;
};

/** Things a plan either has or hasn't. */
export const planFeatures = ["tokens", "mcp", "sourcemaps", "config", "rules", "audit", "digest", "whitelabel"] as const;
export type PlanFeature = (typeof planFeatures)[number];

/** What Stripe knows about this organisation. Written by the webhook, read by the dashboard. */
export type OrgBilling = {
  customerId?: string;
  subscriptionId?: string;
  status?: "trialing" | "active" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "paused";
  priceId?: string;
  interval?: "month" | "year";
  /** When the current period ends, so the dashboard can say "until 3 December". */
  periodEnd?: string;
  /** Set when the subscription is ending at the period end rather than renewing. */
  cancelAt?: string;
  /** Last thing Stripe told us that someone might need to act on. */
  problem?: string;
};

export const organisations = pgTable("organisations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<OrgSettings>().notNull().default({}),
  /** The plan in force now, trial included. A trial is a plan with an end date. */
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  /** Numbers agreed for this organisation alone, overriding the plan's. */
  planLimits: jsonb("plan_limits").$type<Partial<PlanLimits>>().notNull().default({}),
  /** When a trial of `plan` runs out. Null once there is a subscription. */
  trialEndsAt: ts("trial_ends_at"),
  billing: jsonb("billing").$type<OrgBilling>().notNull().default({}),
  createdAt: created(),
  updatedAt: updated(),
});

export type Role = "owner" | "member";

/**
 * When Issueit emails this person about this organisation. Kept inside their
 * membership preferences, because it's a choice per person per organisation:
 * you might want every report from your own project and none from a colleague's.
 */
export type NotifyPrefs = {
  /** Which arriving reports are worth an email. */
  reports: "off" | "critical" | "high" | "all";
  /** A destination Issueit had to pause, or deliveries failing. */
  pipeline: boolean;
  /** A summary of the day or the week. */
  digest: "off" | "daily" | "weekly";
  /** Projects to stay quiet about. */
  mutedProjects: string[];
};

export const defaultNotifyPrefs: NotifyPrefs = { reports: "critical", pipeline: true, digest: "off", mutedProjects: [] };

export const notifyWithDefaults = (prefs: Record<string, unknown> | null | undefined): NotifyPrefs => ({
  ...defaultNotifyPrefs,
  ...((prefs?.notify as Partial<NotifyPrefs> | undefined) ?? {}),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull().default("member"),
    /** This person's dashboard layout and display choices in this organisation. */
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<Role>().notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    createdAt: created(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

/* -------------------------------------------------------------- projects */

/** A question the widget asks besides the built-in ones. Answers go in metadata.fields[key]. */
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

export type WidgetConfig = {
  /* Launcher */
  showButton: boolean;
  buttonLabel: string;
  buttonIcon: "bug" | "chat" | "flag" | "help" | "logo" | "none";
  buttonStyle: "pill" | "square" | "icon";
  buttonSize: "sm" | "md" | "lg";
  position: WidgetPosition;
  offsetX: number;
  offsetY: number;
  /* Appearance */
  theme: "auto" | "light" | "dark";
  accent: string | null;
  radius: number;
  panelWidth: number;
  font: "system" | "inherit";
  shadow: "none" | "soft" | "strong";
  backdrop: boolean;
  /* Brand */
  /** Path of the uploaded logo, e.g. /v1/prj_…/logo?v=…; the widget and emails prefix their own host. */
  logo: string | null;
  brandName: string;
  headerStyle: "plain" | "filled";
  poweredBy: boolean;
  /* Words */
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
  /* Fields */
  collectEmail: FieldMode;
  collectName: FieldMode;
  descriptionRequired: boolean;
  askPriority: boolean;
  defaultPriority: Priority;
  categories: string[];
  categoryLabel: string;
  customFields: WidgetField[];
  /* Attachments */
  allowAttachments: boolean;
  allowScreenshot: boolean;
  maxFiles: number;
  /* Behaviour */
  shortcut: string | null;
  autoCloseSeconds: number;
  hideOnMobile: boolean;
  includePages: string[];
  excludePages: string[];
  sendContext: boolean;
  /** Recent console messages and uncaught errors. */
  captureConsole: boolean;
  /** Recent requests the page made: method, address without the query, status and timing. */
  captureNetwork: boolean;
  /** Recent clicks and page changes, never what was typed. */
  captureSteps: boolean;
  environment: string | null;
};

export const defaultWidgetConfig: WidgetConfig = {
  showButton: true,
  buttonLabel: "Report a bug",
  buttonIcon: "bug",
  buttonStyle: "pill",
  buttonSize: "md",
  position: "bottom-right",
  offsetX: 18,
  offsetY: 18,
  theme: "auto",
  accent: null,
  radius: 12,
  panelWidth: 360,
  font: "system",
  shadow: "soft",
  backdrop: false,
  logo: null,
  brandName: "",
  headerStyle: "plain",
  poweredBy: true,
  title: "Report a bug",
  intro: "",
  titleLabel: "What went wrong?",
  titlePlaceholder: "A short summary",
  descriptionLabel: "Details",
  descriptionPlaceholder: "What did you expect, and what happened instead?",
  submitLabel: "Send report",
  successTitle: "Report sent",
  successMessage: "Thanks. The team has it.",
  footerNote: "Sends this page's address, browser details and recent errors with your report.",
  privacyUrl: null,
  updatesLabel: "Email me updates about this report",
  duplicateMessage: "Others have reported this too, so it's already with the team.",
  collectEmail: "optional",
  collectName: "off",
  descriptionRequired: false,
  askPriority: false,
  defaultPriority: "medium",
  categories: [],
  categoryLabel: "Type",
  customFields: [],
  allowAttachments: true,
  allowScreenshot: true,
  maxFiles: 5,
  shortcut: null,
  autoCloseSeconds: 0,
  hideOnMobile: false,
  includePages: [],
  excludePages: [],
  sendContext: true,
  captureConsole: true,
  captureNetwork: true,
  captureSteps: true,
  environment: null,
};

/** Older rows predate some options; fill them from the defaults. */
export const widgetWithDefaults = (w: Partial<WidgetConfig> | null | undefined): WidgetConfig => ({ ...defaultWidgetConfig, ...(w ?? {}) });

/**
 * Emails to the person who sent a report: a receipt, and a note when it's
 * fixed. Sent through Issueit's own mail server or one of the organisation's
 * email connections.
 */
export type ProjectEmailSettings = {
  enabled: boolean;
  receipt: boolean;
  resolved: boolean;
  /** "issueit" uses the server's SMTP_URL; "connection" uses connectionId. */
  sender: "issueit" | "connection";
  connectionId: string | null;
  /** Display name for Issueit's sender. Empty means the brand or project name. */
  fromName: string;
  replyTo: string | null;
  receiptMessage: string;
  resolvedMessage: string;
};

export const defaultEmailSettings: ProjectEmailSettings = {
  enabled: false,
  receipt: true,
  resolved: true,
  sender: "issueit",
  connectionId: null,
  fromName: "",
  replyTo: null,
  receiptMessage: "",
  resolvedMessage: "",
};

export const emailsWithDefaults = (e: Partial<ProjectEmailSettings> | null | undefined): ProjectEmailSettings => ({ ...defaultEmailSettings, ...(e ?? {}) });

/**
 * Project rules that change how reports are handled before they are stored.
 * Both are previewable in the dashboard against real reports, because a rule
 * you can't test is a rule nobody trusts.
 */
export type ProjectRules = {
  /** How duplicates are recognised, on top of the built-in normalisation. */
  grouping?: {
    /** Regular expressions removed from the title before it is compared. */
    titlePatterns?: string[];
    /** Compare titles only, ignoring which page the report came from. */
    ignorePage?: boolean;
    /** Compare only the first n path segments, so /docs/a and /docs/b are one page. */
    pathDepth?: number;
  };
  /** What else is removed from captured text, on top of the built-in patterns. */
  redaction?: {
    patterns?: Array<{ pattern: string; replacement?: string; label?: string }>;
  };
};

export type StoredLogo = { storageKey: string; contentType: string; sizeBytes: number; hash: string };

export const projects = pgTable(
  "projects",
  {
    /** Public identifier, safe to embed in a page (prj_…). */
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    publicSubmissions: boolean("public_submissions").notNull().default(true),
    allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'::text[]`),
    widget: jsonb("widget").$type<WidgetConfig>().notNull().default(defaultWidgetConfig),
    emails: jsonb("emails").$type<Partial<ProjectEmailSettings>>().notNull().default({}),
    logo: jsonb("logo").$type<StoredLogo>(),
    /** Reports with the same fingerprint join the open report that came first. */
    groupDuplicates: boolean("group_duplicates").notNull().default(true),
    /** Grouping and redaction rules of this project's own. */
    rules: jsonb("rules").$type<ProjectRules>().notNull().default({}),
    reportSeq: integer("report_seq").notNull().default(0),
    lastReportAt: ts("last_report_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Visible start of the key, e.g. "sk_live_a1b2", used to tell keys apart. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    /** AES-GCM copy so owners can reveal the key again; lookups use keyHash. */
    keyEncrypted: text("key_encrypted").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: created(),
  },
  (t) => [index("api_keys_project_idx").on(t.projectId)],
);

/* -------------------------------------------------- account tokens */

/**
 * What an account token may do. Reads and writes are separate, so an agent
 * can be given a token that reads bugs but can never change where reports go.
 */
export const scopes = [
  "reports:read",
  "reports:write",
  "projects:read",
  "projects:write",
  "destinations:read",
  "destinations:write",
  "connections:read",
  "connections:write",
  "deliveries:read",
  "deliveries:write",
  "analytics:read",
  "keys:write",
  "org:read",
  "org:write",
] as const;
export type Scope = (typeof scopes)[number];

/** Scopes only an owner may hold: they let other people in, or mint ingest keys. */
export const ownerOnlyScopes: readonly Scope[] = ["org:write", "keys:write"];

/** A sensible set for a coding agent: read the bugs, fix them, mark them done. */
export const agentScopes: readonly Scope[] = [
  "reports:read",
  "reports:write",
  "projects:read",
  "destinations:read",
  "connections:read",
  "deliveries:read",
  "analytics:read",
  "org:read",
];

/**
 * A token for the management API, used by the MCP server, the CLI and CI.
 * Unlike an ingest key it is organisation-wide, carries scopes, and is shown
 * once: there is no encrypted copy to reveal later.
 */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    /** Whose authority the token carries. Its role is read fresh on every request. */
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Visible start of the token, e.g. "ak_live_a1b2", used to tell tokens apart. */
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scopes: text("scopes").array().$type<Scope[]>().notNull(),
    /** Null means every project in the organisation; otherwise a fence. */
    projectIds: text("project_ids").array(),
    lastUsedAt: ts("last_used_at"),
    lastUsedIp: text("last_used_ip"),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    createdAt: created(),
  },
  (t) => [index("access_tokens_org_idx").on(t.orgId), index("access_tokens_user_idx").on(t.userId)],
);

/**
 * Who changed what. Written for every state-changing request, by a person in
 * the dashboard or by a token, so a destination that starts misbehaving can
 * be traced back to the change that did it.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    tokenId: text("token_id").references(() => accessTokens.id, { onDelete: "set null" }),
    /** Who it was, kept as text so the trail still reads after someone leaves. */
    actor: text("actor").notNull(),
    /** How they were authenticated. */
    via: text("via").$type<"session" | "token">().notNull(),
    /** Verb and subject, e.g. "destination.update". */
    action: text("action").notNull(),
    /** What it acted on: an id, or a path when there is no single subject. */
    target: text("target"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: created(),
  },
  (t) => [index("audit_events_org_created_idx").on(t.orgId, t.createdAt)],
);

/* --------------------------------------------------------------- reports */

export const reportStatuses = ["new", "investigating", "resolved", "closed"] as const;
export type ReportStatus = (typeof reportStatuses)[number];
export const priorities = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof priorities)[number];

export type ReportContext = {
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  viewport?: string;
  screen?: string;
  language?: string;
  timezone?: string;
  referrer?: string;
};

export type ConsoleEntry = {
  t: number;
  level: "error" | "warn" | "info" | "log";
  message: string;
  stack?: string;
  /** The same stack through the release's source maps. Added when read, never stored. */
  original?: string;
};
export type NetworkEntry = { t: number; method: string; url: string; status: number | null; ms: number; error?: string };
export type StepEntry = { t: number; kind: "click" | "navigate" | "input"; label: string };

/** What the widget saw before the report was sent. `t` is milliseconds before sending. */
export type Diagnostics = { console?: ConsoleEntry[]; network?: NetworkEntry[]; steps?: StepEntry[] };

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<ReportStatus>().notNull().default("new"),
    priority: text("priority").$type<Priority>().notNull().default("medium"),
    source: text("source").notNull().default("api"),
    environment: text("environment"),
    pageUrl: text("page_url"),
    browser: text("browser"),
    context: jsonb("context").$type<ReportContext>().notNull().default({}),
    /** ISO 3166 alpha-2, from a trusted proxy header or the reporter's time zone. */
    country: text("country"),
    reporterEmail: text("reporter_email"),
    reporterName: text("reporter_name"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    diagnostics: jsonb("diagnostics").$type<Diagnostics>().notNull().default({}),
    /** The reporter asked for emails about this report. */
    notifyReporter: boolean("notify_reporter").notNull().default(false),
    /** Groups duplicates: the same bug, normalised. See server/ingest/grouping.ts. */
    fingerprint: text("fingerprint"),
    /** The first report of the group this one joined. Null for a report that stands alone or leads a group. */
    groupId: text("group_id").references((): AnyPgColumn => reports.id, { onDelete: "set null" }),
    /** On a group's first report: how many others joined it. */
    duplicateCount: integer("duplicate_count").notNull().default(0),
    lastSeenAt: ts("last_seen_at"),
    resolvedAt: ts("resolved_at"),
    /** Which build this happened on, e.g. "2.3.1" or a commit. Matches a release for symbolication. */
    release: text("release"),
    /** The caller's own key for this report, so a retried submission doesn't file it twice. */
    idempotencyKey: text("idempotency_key"),
    /** Who on the team is dealing with it. Issueit isn't a tracker, but someone has to own it. */
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Keyed hash of the submitter's IP, for abuse throttling only. */
    ipHash: text("ip_hash"),
    viaKeyId: text("via_key_id"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("reports_org_created_idx").on(t.orgId, t.createdAt),
    index("reports_project_created_idx").on(t.projectId, t.createdAt),
    uniqueIndex("reports_project_number_idx").on(t.projectId, t.number),
    index("reports_fingerprint_idx").on(t.projectId, t.fingerprint),
    index("reports_group_idx").on(t.groupId),
    index("reports_ip_idx").on(t.projectId, t.ipHash, t.createdAt),
    index("reports_assignee_idx").on(t.assigneeId),
    uniqueIndex("reports_idempotency_idx").on(t.projectId, t.idempotencyKey),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: created(),
  },
  (t) => [index("attachments_report_idx").on(t.reportId), index("attachments_org_idx").on(t.orgId)],
);

/* -------------------------------------------------------------- releases */

/**
 * A build of a project. Reports name the release they happened on, and a
 * release carries the source maps that turn a minified stack into a file and
 * a line someone can open.
 */
/**
 * A note the team leaves on a report: what was tried, what it turned out to
 * be. Internal, never sent anywhere, never shown to the reporter.
 */
export const reportNotes = pgTable(
  "report_notes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    /** Kept as text as well, so a note still reads after its author leaves. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    author: text("author").notNull(),
    body: text("body").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("report_notes_report_idx").on(t.reportId, t.createdAt)],
);

export const releases = pgTable(
  "releases",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** What the app calls this build: a version, a tag or a commit. */
    version: text("version").notNull(),
    /** Which bundle, when one release ships several, e.g. "web" and "admin". */
    dist: text("dist"),
    commit: text("commit"),
    /** Where to read the code: a compare link or a commit page. */
    url: text("url"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("releases_version_idx").on(t.projectId, t.version, t.dist), index("releases_project_idx").on(t.projectId)],
);

/**
 * One uploaded source map, found by the address of the file it belongs to.
 * Matching is by filename, so a map uploaded for "/assets/app-8fd2.js" is
 * used for a stack frame in that file whatever host served it.
 */
export const sourceMaps = pgTable(
  "source_maps",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    /** The built file this maps, as the browser names it, e.g. "assets/app-8fd2.js". */
    file: text("file").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("source_maps_file_idx").on(t.releaseId, t.file)],
);

/* ---------------------------------------------------------- device login */

/**
 * The command line's sign-in: it shows a short code, the person approves it
 * in the dashboard, and the token is handed back on the next poll. Nothing
 * secret is ever typed into a terminal.
 */
export const deviceCodes = pgTable(
  "device_codes",
  {
    /** sha256 of the secret the client polls with. */
    id: text("id").primaryKey(),
    /** The short code a person reads out and types in, e.g. "WDJB-MJHT". */
    userCode: text("user_code").notNull().unique(),
    name: text("name").notNull(),
    scopes: text("scopes").array().$type<Scope[]>().notNull(),
    status: text("status").$type<"pending" | "approved" | "denied">().notNull().default("pending"),
    /** Set once someone approves it. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id").references(() => organisations.id, { onDelete: "cascade" }),
    /** The token minted on approval, handed over once and then forgotten. */
    tokenSecret: text("token_secret"),
    approvedAt: ts("approved_at"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("device_codes_expiry_idx").on(t.expiresAt)],
);

/* ---------------------------------------------------------- integrations */

export type ConnectionAccount = {
  label: string;
  url?: string;
  avatarUrl?: string;
  /** Provider-specific values that are not secret, e.g. Jira site URL. */
  extra?: Record<string, string>;
};

/** An authenticated account with an external service, shared across the organisation's projects. */
export const connections = pgTable(
  "connections",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    authType: text("auth_type").$type<"oauth" | "token">().notNull(),
    /** AES-256-GCM encrypted JSON. Never sent to the browser. */
    credentials: text("credentials").notNull(),
    account: jsonb("account").$type<ConnectionAccount>().notNull(),
    status: text("status").$type<"active" | "error">().notNull().default("active"),
    lastError: text("last_error"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("connections_org_idx").on(t.orgId)],
);

export type RoutingRule = {
  /** Empty or missing means "any". */
  priorities?: Priority[];
  sources?: string[];
  environments?: string[];
};

/**
 * How a destination is delivered to: retries, timeouts, pacing and what the
 * report carries. Stored sparse; see server/delivery/policy.ts for defaults.
 */
export type DeliveryPolicy = {
  maxAttempts?: number;
  backoff?: "standard" | "exponential" | "linear" | "fixed";
  baseDelaySeconds?: number;
  maxDelaySeconds?: number;
  timeoutSeconds?: number;
  respectRetryAfter?: boolean;
  retryServerErrors?: boolean;
  retryRateLimits?: boolean;
  retryNetworkErrors?: boolean;
  retryClientErrors?: boolean;
  sendDelaySeconds?: number;
  rateLimitPerMinute?: number;
  autoPauseAfter?: number;
  titlePrefix?: string;
  includeDescription?: boolean;
  includeContext?: boolean;
  includeMetadata?: boolean;
  includeAttachments?: boolean;
  includeReporter?: boolean;
  includeDiagnostics?: boolean;
};

export type AttemptLogEntry = { at: string; ok: boolean; ms: number; status?: number | null; error?: string | null };

export const webhookEvents = ["report.created", "report.updated", "report.resolved", "report.closed", "report.duplicate"] as const;
export type WebhookEvent = (typeof webhookEvents)[number];

/** Where a project's reports go: a connection plus a target (repository, team, list, URL…). */
export const destinations = pgTable(
  "destinations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    connectionId: text("connection_id").references(() => connections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Non-secret target details, e.g. { repo: "acme/web", labels: ["bug"] }. */
    target: jsonb("target").$type<Record<string, unknown>>().notNull().default({}),
    /** Encrypted JSON for URL-based destinations: webhook URL, signing secret. */
    secrets: text("secrets"),
    enabled: boolean("enabled").notNull().default(true),
    events: text("events").array().$type<WebhookEvent[]>().notNull().default(sql`'{report.created}'::text[]`),
    rule: jsonb("rule").$type<RoutingRule>().notNull().default({}),
    policy: jsonb("policy").$type<DeliveryPolicy>().notNull().default({}),
    /** Set when Issueit paused the destination itself, e.g. after repeated failures. */
    pausedReason: text("paused_reason"),
    /** Trackers: resolve the report when its issue is closed there. */
    syncState: boolean("sync_state").notNull().default(true),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("destinations_project_idx").on(t.projectId)],
);

export type DeliveryStatus = "pending" | "delivering" | "delivered" | "retrying" | "failed";

export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportId: text("report_id").references(() => reports.id, { onDelete: "cascade" }),
    destinationId: text("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    /** Prevents the same event being queued twice for one destination. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    /** Snapshot of the event for webhooks, so retries send identical bodies. */
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    status: text("status").$type<DeliveryStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    responseStatus: integer("response_status"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    /** The issue's state in the tracker, last time Issueit looked: open, resolved or closed. */
    externalState: text("external_state"),
    stateCheckedAt: ts("state_checked_at"),
    isTest: boolean("is_test").notNull().default(false),
    /** The most recent attempts, newest last, capped. */
    attemptLog: jsonb("attempt_log").$type<AttemptLogEntry[]>().notNull().default([]),
    durationMs: integer("duration_ms"),
    deliveredAt: ts("delivered_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("deliveries_report_idx").on(t.reportId),
    index("deliveries_destination_idx").on(t.destinationId, t.createdAt),
    index("deliveries_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export type EmailKind = "receipt" | "resolved";
export type EmailStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

/** Outbox for emails to reporters. One row per report, kind and address. */
export const emails = pgTable(
  "emails",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    kind: text("kind").$type<EmailKind>().notNull(),
    to: text("to").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").$type<EmailStatus>().notNull().default("pending"),
    /** Who sent it: "issueit" or the provider of the connection used. */
    via: text("via"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    messageId: text("message_id"),
    sentAt: ts("sent_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("emails_due_idx").on(t.status, t.nextAttemptAt),
    index("emails_report_idx").on(t.reportId),
    index("emails_to_idx").on(t.orgId, t.to, t.createdAt),
    index("emails_project_idx").on(t.projectId, t.createdAt),
  ],
);

export const noticeKinds = [
  "password-reset",
  "verify-email",
  "invitation",
  "report",
  "pipeline",
  "digest",
  "limit-warning",
  "limit-reached",
  "trial-ending",
  "payment-problem",
] as const;
export type NoticeKind = (typeof noticeKinds)[number];

/**
 * Email Issueit sends on its own behalf: a reset link, an invitation, a new
 * report someone asked to hear about, the daily digest. Separate from the
 * `emails` outbox, which is reporter-facing and sent as the customer's brand
 * through their own mail service. These always go through the install's own
 * SMTP server, because they're from Issueit, not from a project.
 *
 * The row holds the context rather than the rendered message, so a template
 * fix reaches everything still queued.
 */
export const notices = pgTable(
  "notices",
  {
    id: text("id").primaryKey(),
    /** Null for anything that happens before an organisation exists, like a reset. */
    orgId: text("org_id").references(() => organisations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    to: text("to").notNull(),
    kind: text("kind").$type<NoticeKind>().notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    /** Stops a second copy of the same daily digest or limit warning. */
    dedupeKey: text("dedupe_key").unique(),
    status: text("status").$type<EmailStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    messageId: text("message_id"),
    sentAt: ts("sent_at"),
    createdAt: created(),
  },
  (t) => [index("notices_due_idx").on(t.status, t.nextAttemptAt), index("notices_user_idx").on(t.userId, t.createdAt)],
);

/**
 * Reports Issueit turned away, by month and by reason. The count is the
 * honest version of "you have outgrown this plan": it says how much was
 * actually lost, not how close to a line you are.
 */
export const usageRefusals = pgTable(
  "usage_refusals",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    /** The month it happened in, as YYYY-MM. */
    month: text("month").notNull(),
    reason: text("reason").$type<"plan_limit" | "storage_limit">().notNull(),
    count: integer("count").notNull().default(0),
    lastAt: ts("last_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.month, t.reason] })],
);

export const oauthStates = pgTable("oauth_states", {
  id: text("id").primaryKey(),
  orgId: text("org_id")
    .notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  returnTo: text("return_to").notNull(),
  codeVerifier: text("code_verifier"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: created(),
});
