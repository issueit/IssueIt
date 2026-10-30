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

  allowSignup: bool("ALLOW_SIGNUP", true),
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
    reportsPerMonth: int("PLAN_REPORTS_PER_MONTH", 0),
    storageBytes: int("PLAN_STORAGE_MB", 0) * 1024 * 1024,
    attachmentLinkDays: int("ATTACHMENT_LINK_DAYS", 30),
  },

  smtp: {
    url: optional("SMTP_URL"),
    from: str("SMTP_FROM", "Issueit <no-reply@issueit.app>"),
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
