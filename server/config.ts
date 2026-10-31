/**
 * Runtime configuration, read once from the environment.
 *
 * Every public URL can be overridden so the same build serves both the
 * hosted layout (dash./drop./cdn./docs.issueit.app) and a single-origin
 * self-hosted install such as http://192.168.0.62:8380.
 */

function str(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== "") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

function int(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be a whole number`);
  return parsed;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

const appUrl = trimSlash(str("APP_URL", "http://localhost:8380"));

export const config = {
  env: str("NODE_ENV", "development"),
  role: str("ROLE", "all") as "all" | "api" | "worker",
  host: str("HOST", "0.0.0.0"),
  port: int("PORT", 8380),

  appUrl,
  dropUrl: trimSlash(str("DROP_URL", appUrl)),
  cdnUrl: trimSlash(str("CDN_URL", appUrl)),
  docsUrl: trimSlash(str("DOCS_URL", `${appUrl}/docs`)),
  marketingUrl: trimSlash(str("MARKETING_URL", appUrl)),
  cookieSecure: appUrl.startsWith("https://"),
  trustProxy: bool("TRUST_PROXY", false),

  databaseUrl: str("DATABASE_URL", "postgres://issueit:issueit@localhost:5432/issueit"),
  encryptionKey: str("ENCRYPTION_KEY", ""),
  secretKey: str("SECRET_KEY", ""),
  dataDir: str("DATA_DIR", "./data"),

  /**
   * "hosted" turns on plans, billing and the per-organisation limits that go
   * with them. A self-hosted install is "selfhost": every feature is on and
   * the limits below are the operator's own, not a plan's.
   */
  edition: (optional("EDITION") === "hosted" ? "hosted" : "selfhost") as "hosted" | "selfhost",
  /** Days a new organisation gets on the trial plan. 0 starts everyone on free. */
  trialDays: int("TRIAL_DAYS", 14),

  allowSignup: bool("ALLOW_SIGNUP", true),
  /** Turns on /metrics when set; the same value is the bearer token for it. */
  metricsToken: optional("METRICS_TOKEN") ?? "",
  /** How often to ask trackers whether issues were closed. 0 turns it off. */
  syncMinutes: int("SYNC_INTERVAL_MINUTES", 5),
  webhookAllowPrivate: bool("WEBHOOK_ALLOW_PRIVATE", false),

  limits: {
    attachmentBytes: int("MAX_ATTACHMENT_MB", 10) * 1024 * 1024,
    attachmentsPerReport: int("MAX_ATTACHMENTS_PER_REPORT", 5),
    jsonBodyBytes: 256 * 1024,
    reportsPerIpPerMinute: int("RATE_LIMIT_IP_PER_MINUTE", 10),
    reportsPerProjectPerHour: int("RATE_LIMIT_PROJECT_PER_HOUR", 1000),
    reportsPerKeyPerMinute: int("RATE_LIMIT_KEY_PER_MINUTE", 120),
    /** Management API requests one account token may make a minute. */
    tokenRequestsPerMinute: int("RATE_LIMIT_TOKEN_PER_MINUTE", 600),
    reportsPerMonth: int("PLAN_REPORTS_PER_MONTH", 0),
    storageBytes: int("PLAN_STORAGE_MB", 0) * 1024 * 1024,
    attachmentLinkDays: int("ATTACHMENT_LINK_DAYS", 30),
  },

  smtp: {
    url: optional("SMTP_URL"),
    from: str("SMTP_FROM", "Issueit <no-reply@issueit.app>"),
  },

  /** Payments. Without a secret key the billing endpoints say so rather than half-working. */
  stripe: {
    secretKey: optional("STRIPE_SECRET_KEY") ?? "",
    webhookSecret: optional("STRIPE_WEBHOOK_SECRET") ?? "",
    /** Price ids from the Stripe dashboard, one per plan and interval. */
    prices: {
      solo: { monthly: optional("STRIPE_PRICE_SOLO_MONTHLY") ?? "", yearly: optional("STRIPE_PRICE_SOLO_YEARLY") ?? "" },
      team: { monthly: optional("STRIPE_PRICE_TEAM_MONTHLY") ?? "", yearly: optional("STRIPE_PRICE_TEAM_YEARLY") ?? "" },
      business: { monthly: optional("STRIPE_PRICE_BUSINESS_MONTHLY") ?? "", yearly: optional("STRIPE_PRICE_BUSINESS_YEARLY") ?? "" },
    },
  },

  /** Where the daily jobs run: retention, digests, trial endings. 0 turns them off. */
  jobs: {
    hour: int("JOBS_HOUR_UTC", 7),
    retention: bool("RETENTION_ENABLED", true),
  },

  oauth: {
    github: { clientId: optional("GITHUB_CLIENT_ID"), clientSecret: optional("GITHUB_CLIENT_SECRET") },
    linear: { clientId: optional("LINEAR_CLIENT_ID"), clientSecret: optional("LINEAR_CLIENT_SECRET") },
    clickup: { clientId: optional("CLICKUP_CLIENT_ID"), clientSecret: optional("CLICKUP_CLIENT_SECRET") },
    trello: { apiKey: optional("TRELLO_API_KEY") },
    discord: { clientId: optional("DISCORD_CLIENT_ID"), clientSecret: optional("DISCORD_CLIENT_SECRET") },
    slack: { clientId: optional("SLACK_CLIENT_ID"), clientSecret: optional("SLACK_CLIENT_SECRET") },
    notion: { clientId: optional("NOTION_CLIENT_ID"), clientSecret: optional("NOTION_CLIENT_SECRET") },
    jira: { clientId: optional("JIRA_CLIENT_ID"), clientSecret: optional("JIRA_CLIENT_SECRET") },
    gitlab: {
      clientId: optional("GITLAB_CLIENT_ID"),
      clientSecret: optional("GITLAB_CLIENT_SECRET"),
      baseUrl: trimSlash(str("GITLAB_URL", "https://gitlab.com")),
    },
  },
};

export type Config = typeof config;
