import type { ConnectionAccount, WebhookEvent } from "../../db/schema";
import { checkUrlShape, UnsafeUrlError } from "../../lib/ssrf";
import { IntegrationError, request, type ApiResponse, type RequestInit } from "../http";
import type { Category, DeliveryResult, Provider, ReportPayload, TokenField } from "../types";

/**
 * The catalogue: services connected with a token, key or URL, each written
 * as a short spec. `define` turns a spec into a Provider, so the dashboard,
 * the delivery worker and tests treat them like the hand-written ones.
 */

export type Fields = Record<string, string>;

export type SendContext = {
  report: ReportPayload;
  /** What the person typed when connecting, trimmed. Secret. */
  creds: Fields;
  /** What the person typed when choosing where reports go. Not secret. */
  target: Fields;
  isTest: boolean;
  deliveryId: string;
  event: WebhookEvent;
};

export type Spec = {
  id: string;
  name: string;
  category: Exclude<Category, "webhook">;
  summary: string;
  keywords?: string[];
  fields: TokenField[];
  help?: { text: string; url: string };
  /** For services where one connection reaches many places (projects, boards, channels). */
  target?: { label: string; fields: TokenField[] };
  /** Confirms the credentials and names the account. Without it, the first test confirms them. */
  check?(creds: Fields): Promise<ConnectionAccount> | ConnectionAccount;
  send(ctx: SendContext): Promise<DeliveryResult>;
};

const trackerLike: Spec["category"][] = ["tracker", "helpdesk", "data"];

export function define(spec: Spec): Provider {
  const clean = (fields: Record<string, unknown>) => {
    const out: Fields = {};
    for (const f of spec.fields) {
      const value = String(fields[f.key] ?? "").trim();
      if (value) out[f.key] = value;
    }
    return out;
  };
  return {
    id: spec.id,
    name: spec.name,
    kind: trackerLike.includes(spec.category) ? "tracker" : "chat",
    category: spec.category,
    keywords: spec.keywords,
    summary: spec.summary,
    targetLabel: spec.target?.label ?? null,
    targetFields: spec.target?.fields,
    events: ["report.created"],
    tokenFields: spec.fields,
    tokenHelp: spec.help,
    async connectWithToken(fields) {
      const creds = clean(fields);
      const account = spec.check ? await spec.check(creds) : { label: defaultLabel(spec.name, creds) };
      return { credentials: creds, account };
    },
    validate: spec.check ? async (conn) => spec.check!(clean(conn.credentials)) : undefined,
    async deliver(ctx) {
      const target: Fields = {};
      for (const [k, v] of Object.entries(ctx.target)) if (typeof v === "string") target[k] = v;
      for (const f of spec.target?.fields ?? [])
        if (!f.optional && !target[f.key]) throw new IntegrationError(`This destination is missing its ${f.label.toLowerCase()}. Edit it and save again.`, { retryable: false });
      return spec.send({ report: ctx.report, creds: clean(ctx.connection?.credentials ?? {}), target, isTest: ctx.isTest, deliveryId: ctx.deliveryId, event: ctx.event });
    },
  };
}

/** "Gotify · push.example.com", or just the service name when there's no address to show. */
function defaultLabel(name: string, creds: Fields) {
  const address = creds.url ?? creds.domain ?? creds.site ?? creds.instance ?? creds.space;
  if (!address) return name;
  try {
    return `${name} · ${new URL(address.includes("://") ? address : `https://${address}`).host}`;
  } catch {
    return name;
  }
}

/* ------------------------------------------------------------------ field shorthands */

export const secret = (key: string, label: string, hint?: string, placeholder?: string): TokenField => ({ key, label, hint, placeholder, secret: true });
export const text = (key: string, label: string, hint?: string, placeholder?: string): TokenField => ({ key, label, hint, placeholder });
export const optional = (field: TokenField): TokenField => ({ ...field, optional: true });

/* ------------------------------------------------------------------ requests */

/**
 * Every catalogue request goes through the SSRF guard: many of these hosts
 * are typed in by the person connecting (self-hosted servers, webhook URLs).
 */
export function call<T = any>(service: string, url: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  return request<T>(service, url, { thing: "destination", ...init, untrusted: true });
}

/** A base URL the person typed, checked and without a trailing slash. */
export function baseUrl(raw: string | undefined, label = "server URL"): string {
  if (!raw) throw new IntegrationError(`Enter the ${label}.`, { retryable: false });
  let url: URL;
  try {
    url = checkUrlShape(raw.includes("://") ? raw : `https://${raw}`);
  } catch (err) {
    throw new IntegrationError(err instanceof UnsafeUrlError ? err.message : `That ${label} isn't valid.`, { retryable: false });
  }
  return url.toString().replace(/\/+$/, "");
}

/** A webhook URL that must live on one of the service's own hosts. */
export function hookUrl(raw: string | undefined, service: string, hosts: RegExp): string {
  const url = baseUrl(raw, "webhook URL");
  if (!hosts.test(new URL(url).hostname)) throw new IntegrationError(`That isn't a ${service} webhook URL.`, { retryable: false });
  return url;
}

export const basic = (user: string, pass: string) => ({ authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` });

/** Joins a path onto a base URL, encoding each dynamic segment. */
export const seg = (value: string) => encodeURIComponent(value);
