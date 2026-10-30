import type { ComponentType } from "react";
import {
  siAirtable,
  siAsana,
  siBasecamp,
  siBaserow,
  siBetterstack,
  siBitbucket,
  siBrevo,
  siClickup,
  siCloudflare,
  siCoda,
  siCodeberg,
  siDatadog,
  siDiscord,
  siForgejo,
  siGitea,
  siGithub,
  siGitlab,
  siGooglechat,
  siGooglepubsub,
  siGooglesheets,
  siGrafana,
  siHelpscout,
  siHubspot,
  siIfttt,
  siIntercom,
  siJira,
  siLine,
  siLinear,
  siMailgun,
  siMake,
  siMatrix,
  siMattermost,
  siMixpanel,
  siN8n,
  siNewrelic,
  siNotion,
  siNtfy,
  siOpenproject,
  siOpsgenie,
  siPagerduty,
  siPlane,
  siPosthog,
  siPushbullet,
  siRedmine,
  siResend,
  siRocketdotchat,
  siShortcut,
  siSourcehut,
  siSparkpost,
  siSplunk,
  siSupabase,
  siTelegram,
  siThreema,
  siTodoist,
  siTrello,
  siVikunja,
  siVonage,
  siWebex,
  siZapier,
  siZendesk,
  siZoho,
  siZoom,
  siZulip,
} from "simple-icons";
import { BellIcon, BoltIcon, ChartIcon, ChatRoundLineIcon, ChecklistMinimalisticIcon, CloudBoltIcon, DatabaseIcon, LetterIcon, Routing2Icon, SirenIcon, TicketIcon } from "./icons";

type Mark = { path: string; title: string };
type Category = "tracker" | "helpdesk" | "chat" | "notify" | "email" | "oncall" | "data" | "automation" | "analytics" | "cloud" | "webhook";

/**
 * Brand marks from Simple Icons, drawn in the current text colour so they
 * stay calm. Services without a mark there (Slack, Microsoft and others
 * whose marks aren't licensed for it) get a plain Solar icon for their
 * kind of service rather than an imitation logo.
 *
 * Roughly half the catalogue has no mark, so where many sit together the
 * shared glyphs repeat into runs. Pass fallback="monogram" there to get the
 * service's initial instead: a letterform stands in for a logo without
 * pretending to be one, and no two land the same.
 */
const marks: Record<string, Mark | Category> = {
  github: siGithub,
  gitlab: siGitlab,
  linear: siLinear,
  clickup: siClickup,
  trello: siTrello,
  discord: siDiscord,
  notion: siNotion,
  jira: siJira,
  slack: "chat",
  webhook: "webhook",
  asana: siAsana,
  monday: "tracker",
  shortcut: siShortcut,
  youtrack: "tracker",
  azuredevops: "tracker",
  bitbucket: siBitbucket,
  sourcehut: siSourcehut,
  githubenterprise: siGithub,
  jiradc: siJira,
  redmine: siRedmine,
  plane: siPlane,
  wrike: "tracker",
  todoist: siTodoist,
  teamwork: "tracker",
  bugzilla: "tracker",
  mantisbt: "tracker",
  openproject: siOpenproject,
  phorge: "tracker",
  kanboard: "tracker",
  vikunja: siVikunja,
  favro: "tracker",
  meistertask: "tracker",
  backlog: "tracker",
  canny: "tracker",
  productboard: "tracker",
  taiga: "tracker",
  gitea: siGitea,
  forgejo: siForgejo,
  codeberg: siCodeberg,
  gogs: "tracker",
  zendesk: siZendesk,
  freshdesk: "helpdesk",
  freshservice: "helpdesk",
  helpscout: siHelpscout,
  intercom: siIntercom,
  front: "helpdesk",
  hubspot: siHubspot,
  servicenow: "helpdesk",
  gorgias: "helpdesk",
  zammad: "helpdesk",
  osticket: "helpdesk",
  attio: "helpdesk",
  airtable: siAirtable,
  smartsheet: "data",
  coda: siCoda,
  baserow: siBaserow,
  nocodb: "data",
  grist: "data",
  supabase: siSupabase,
  googlesheets: siGooglesheets,
  teams: "chat",
  googlechat: siGooglechat,
  mattermost: siMattermost,
  rocketchat: siRocketdotchat,
  pumble: "chat",
  flock: "chat",
  chanty: "chat",
  twist: "chat",
  campfire: "chat",
  basecamp: siBasecamp,
  ringcentral: "chat",
  dingtalk: "chat",
  wecom: "chat",
  feishu: "chat",
  lark: "chat",
  zulip: siZulip,
  webex: siWebex,
  telegram: siTelegram,
  matrix: siMatrix,
  zohocliq: siZoho,
  line: siLine,
  zoom: siZoom,
  threema: siThreema,
  pushover: "notify",
  pushbullet: siPushbullet,
  ntfy: siNtfy,
  gotify: "notify",
  bark: "notify",
  apprise: "notify",
  twilio: "notify",
  vonage: siVonage,
  plivo: "notify",
  resend: siResend,
  postmark: "email",
  sendgrid: "email",
  mailgun: siMailgun,
  brevo: siBrevo,
  mailjet: "email",
  sparkpost: siSparkpost,
  ses: "email",
  pagerduty: siPagerduty,
  opsgenie: siOpsgenie,
  incidentio: "oncall",
  splunkoncall: siSplunk,
  squadcast: "oncall",
  betterstack: siBetterstack,
  zenduty: "oncall",
  ilert: "oncall",
  grafanaoncall: siGrafana,
  zapier: siZapier,
  make: siMake,
  n8n: siN8n,
  pipedream: "automation",
  powerautomate: "automation",
  workato: "automation",
  activepieces: "automation",
  tray: "automation",
  ifttt: siIfttt,
  inngest: "automation",
  datadog: siDatadog,
  newrelic: siNewrelic,
  segment: "analytics",
  rudderstack: "analytics",
  posthog: siPosthog,
  mixpanel: siMixpanel,
  amplitude: "analytics",
  sns: "cloud",
  sqs: "cloud",
  eventbridge: "cloud",
  eventgrid: "cloud",
  servicebus: "cloud",
  pubsub: siGooglepubsub,
  confluent: "cloud",
  cloudflarequeues: siCloudflare,
};

const categoryIcons: Record<Category, ComponentType<{ size?: number; "aria-label"?: string }>> = {
  tracker: ChecklistMinimalisticIcon,
  helpdesk: TicketIcon,
  chat: ChatRoundLineIcon,
  notify: BellIcon,
  email: LetterIcon,
  oncall: SirenIcon,
  data: DatabaseIcon,
  automation: BoltIcon,
  analytics: ChartIcon,
  cloud: CloudBoltIcon,
  webhook: Routing2Icon,
};

export function BrandIcon({ provider, name, size = 16, framed, fallback = "category" }: { provider: string; name?: string; size?: number; framed?: boolean; fallback?: "category" | "monogram" }) {
  const mark = marks[provider] ?? "webhook";
  let icon;
  if (typeof mark === "string" && fallback === "monogram") {
    // The first character as the brand writes it, so n8n and ntfy stay lower case.
    icon = (
      <span role="img" aria-label={name ?? provider} className="grid place-items-center font-mono leading-none" style={{ width: size, height: size, fontSize: Math.round(size * 0.78) }}>
        {(name ?? provider).trim().charAt(0)}
      </span>
    );
  } else if (typeof mark === "string") {
    const Icon = categoryIcons[mark];
    icon = <Icon size={size} aria-label={name ?? provider} />;
  } else {
    icon = (
      <svg role="img" aria-label={name ?? mark.title} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d={mark.path} />
      </svg>
    );
  }
  if (!framed) return icon;
  return (
    <span className="grid place-items-center rounded-md border border-border-subtle bg-surface-3 text-text-2" style={{ width: size + 14, height: size + 14 }}>
      {icon}
    </span>
  );
}
