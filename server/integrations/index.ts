import { config } from "../config";
import { clickup } from "./providers/clickup";
import { discord } from "./providers/discord";
import { github } from "./providers/github";
import { gitlab } from "./providers/gitlab";
import { jira } from "./providers/jira";
import { linear } from "./providers/linear";
import { notion } from "./providers/notion";
import { slack } from "./providers/slack";
import { smtp } from "./providers/smtp";
import { trello } from "./providers/trello";
import { webhook } from "./providers/webhook";
import { catalogue } from "./catalogue";
import type { Provider, ProviderId } from "./types";

/** In the order the dashboard lists them: the ten originals, the catalogue, then SMTP beside the other email services. */
export const providers: Provider[] = [github, linear, clickup, trello, discord, slack, notion, jira, gitlab, webhook, ...catalogue, smtp];

const byId = new Map(providers.map((p) => [p.id, p]));

export function getProvider(id: string): Provider | undefined {
  return byId.get(id as ProviderId);
}

/** Whether this server can offer the provider's OAuth flow. */
export function oauthAvailable(p: Provider): boolean {
  if (p.id === "trello") return !!config.oauth.trello.apiKey;
  return !!(p.oauth?.clientId() && p.oauth.clientSecret());
}

/** The browser-safe description of a provider. */
export function describeProvider(p: Provider) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    category: p.category,
    keywords: p.keywords ?? [],
    summary: p.summary,
    targetLabel: p.targetLabel,
    events: p.events,
    oauth: oauthAvailable(p),
    oauthPossible: !!p.oauth,
    tokenFields: p.tokenFields ?? [],
    targetFields: p.targetFields ?? [],
    tokenHelp: p.tokenHelp ?? null,
    needsConnection: p.kind !== "webhook",
    /** Repeats are added to the first issue as comments. */
    canComment: !!p.comment,
    /** Closing the issue there resolves the report here. */
    canSync: !!p.issueState,
  };
}

export type { Provider, ProviderId };
