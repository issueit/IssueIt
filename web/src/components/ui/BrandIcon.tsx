import type { ComponentType } from "react";
import {
  siAirtable,
  siApachekafka,
  siAsana,
  siBasecamp,
  siBaserow,
  siBetterstack,
  siBitbucket,
  siBrevo,
  siBytedance,
  siClickup,
  siCloudflare,
  siCoda,
  siCodeberg,
  siDatadog,
  siDiscord,
  siFavro,
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
  siMozilla,
  siN8n,
  siNewrelic,
  siNotion,
  siNtfy,
  siOpenproject,
  siOpsgenie,
  siPhabricator,
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
import { brandMarks } from "./brandMarks";
import { BellIcon, BoltIcon, ChartIcon, ChatRoundLineIcon, ChecklistMinimalisticIcon, CloudBoltIcon, DatabaseIcon, LetterIcon, Routing2Icon, SirenIcon, TicketIcon } from "./icons";

type Mark = { path: string; title: string };
type BrandMark = (typeof brandMarks)[keyof typeof brandMarks];
type Category = "tracker" | "helpdesk" | "chat" | "notify" | "email" | "oncall" | "data" | "automation" | "analytics" | "cloud" | "webhook";

/**
 * Brand marks drawn in the current text colour so they stay calm. Most come
 * from Simple Icons; the rest are in brandMarks.ts, gathered from the
 * services' own logos because Simple Icons doesn't carry them.
 *
 * A product with no mark of its own wears the one belonging to whoever runs
 * it: Bugzilla gets Mozilla's, Backlog Nulab's, Lark ByteDance's, Amazon's
 * queues the AWS mark. The handful with neither get a plain Solar icon for
 * their kind of service rather than an imitation logo.
 *
 * Where many of those sit together the shared glyphs repeat into runs. Pass
 * fallback="monogram" there to get the service's initial instead: a
 * letterform stands in for a logo without pretending to be one, and no two
 * land the same.
 */
const marks: Record<string, Mark | BrandMark | Category> = {
  github: siGithub,
  gitlab: siGitlab,
  linear: siLinear,
  clickup: siClickup,
  trello: siTrello,
  discord: siDiscord,
  notion: siNotion,
  jira: siJira,
  slack: brandMarks.slack,
  webhook: "webhook",
  asana: siAsana,
  monday: brandMarks.monday,
  shortcut: siShortcut,
  youtrack: brandMarks.youtrack,
  azuredevops: brandMarks.azuredevops,
  bitbucket: siBitbucket,
  sourcehut: siSourcehut,
  githubenterprise: siGithub,
  jiradc: siJira,
  redmine: siRedmine,
  plane: siPlane,
  wrike: "tracker",
  todoist: siTodoist,
  teamwork: brandMarks.teamwork,
  bugzilla: siMozilla,
  mantisbt: "tracker",
  openproject: siOpenproject,
  phorge: siPhabricator,
  kanboard: brandMarks.kanboard,
  vikunja: siVikunja,
  favro: siFavro,
  meistertask: "tracker",
  backlog: brandMarks.nulab,
  canny: "tracker",
  productboard: brandMarks.productboard,
  taiga: brandMarks.taiga,
  gitea: siGitea,
  forgejo: siForgejo,
  codeberg: siCodeberg,
  gogs: "tracker",
  zendesk: siZendesk,
  freshdesk: "helpdesk",
  freshservice: "helpdesk",
  helpscout: siHelpscout,
  intercom: siIntercom,
  front: brandMarks.front,
  hubspot: siHubspot,
  servicenow: brandMarks.servicenow,
  gorgias: "helpdesk",
  zammad: brandMarks.zammad,
  osticket: brandMarks.osticket,
  attio: brandMarks.attio,
  airtable: siAirtable,
  smartsheet: brandMarks.smartsheet,
  coda: siCoda,
  baserow: siBaserow,
  nocodb: brandMarks.nocodb,
  grist: brandMarks.grist,
  supabase: siSupabase,
  googlesheets: siGooglesheets,
  teams: brandMarks.teams,
  googlechat: siGooglechat,
  mattermost: siMattermost,
  rocketchat: siRocketdotchat,
  pumble: brandMarks.pumble,
  flock: brandMarks.flock,
  chanty: "chat",
  twist: brandMarks.twist,
  campfire: siBasecamp,
  basecamp: siBasecamp,
  ringcentral: "chat",
  dingtalk: brandMarks.dingtalk,
  wecom: brandMarks.wecom,
  feishu: siBytedance,
  lark: siBytedance,
  zulip: siZulip,
  webex: siWebex,
  telegram: siTelegram,
  matrix: siMatrix,
  zohocliq: siZoho,
  line: siLine,
  zoom: siZoom,
  threema: siThreema,
  pushover: brandMarks.pushover,
  pushbullet: siPushbullet,
  ntfy: siNtfy,
  gotify: "notify",
  bark: "notify",
  apprise: brandMarks.apprise,
  twilio: brandMarks.twilio,
  vonage: siVonage,
  plivo: brandMarks.plivo,
  resend: siResend,
  postmark: brandMarks.postmark,
  sendgrid: brandMarks.sendgrid,
  mailgun: siMailgun,
  brevo: siBrevo,
  mailjet: brandMarks.mailjet,
  sparkpost: siSparkpost,
  ses: brandMarks.ses,
  pagerduty: siPagerduty,
  opsgenie: siOpsgenie,
  incidentio: brandMarks.incidentio,
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
  powerautomate: brandMarks.powerautomate,
  workato: "automation",
  activepieces: brandMarks.activepieces,
  tray: brandMarks.tray,
  ifttt: siIfttt,
  inngest: brandMarks.inngest,
  datadog: siDatadog,
  newrelic: siNewrelic,
  segment: brandMarks.segment,
  rudderstack: "analytics",
  posthog: siPosthog,
  mixpanel: siMixpanel,
  amplitude: brandMarks.amplitude,
  sns: brandMarks.aws,
  sqs: brandMarks.sqs,
  eventbridge: brandMarks.aws,
  eventgrid: brandMarks.azure,
  servicebus: brandMarks.azure,
  pubsub: siGooglepubsub,
  confluent: siApachekafka,
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

/** size may be a CSS length, so a caller can scale marks with the viewport. */
const scale = (size: number | string, by: number, plus = 0) => (typeof size === "number" ? Math.round(size * by) + plus : `calc(${size} * ${by} + ${plus}px)`);

export function BrandIcon({
  provider,
  name,
  size = 16,
  framed,
  fallback = "category",
}: {
  provider: string;
  name?: string;
  size?: number | string;
  framed?: boolean;
  fallback?: "category" | "monogram";
}) {
  const mark = marks[provider] ?? "webhook";
  let icon;
  if (typeof mark === "string" && fallback === "monogram") {
    // The first character as the brand writes it, so n8n and ntfy stay lower case.
    icon = (
      <span role="img" aria-label={name ?? provider} className="grid place-items-center font-mono leading-none" style={{ width: size, height: size, fontSize: scale(size, 0.78) }}>
        {(name ?? provider).trim().charAt(0)}
      </span>
    );
  } else if (typeof mark === "string") {
    const Icon = categoryIcons[mark];
    // Solar icons size by number, so a CSS length gets a box to fill instead.
    icon =
      typeof size === "number" ? (
        <Icon size={size} aria-label={name ?? provider} />
      ) : (
        <span className="grid place-items-center [&>svg]:h-full [&>svg]:w-full" style={{ width: size, height: size }}>
          <Icon aria-label={name ?? provider} />
        </span>
      );
  } else if ("body" in mark) {
    // Gathered marks keep their own box; the shapes are generated, not user input.
    icon = <svg role="img" aria-label={name ?? mark.title} width={size} height={size} viewBox={mark.viewBox} fill="currentColor" dangerouslySetInnerHTML={{ __html: mark.body }} />;
  } else {
    icon = (
      <svg role="img" aria-label={name ?? mark.title} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d={mark.path} />
      </svg>
    );
  }
  if (!framed) return icon;
  return (
    <span className="grid place-items-center rounded-md border border-border-subtle bg-surface-3 text-text-2" style={{ width: scale(size, 1, 14), height: scale(size, 1, 14) }}>
      {icon}
    </span>
  );
}
