import { AsyncLocalStorage } from "node:async_hooks";
import { safeFetch, UnsafeUrlError } from "../lib/ssrf";

/** The running delivery's timeout, so a destination's policy reaches every request its provider makes. */
const deliveryTimeout = new AsyncLocalStorage<number>();

export function withTimeout<T>(timeoutMs: number, run: () => Promise<T>): Promise<T> {
  return deliveryTimeout.run(timeoutMs, run);
}

/**
 * Calls to external services. Failures become IntegrationErrors with a
 * sentence a person can act on and a flag saying whether retrying could help.
 */
export class IntegrationError extends Error {
  retryable: boolean;
  reconnect: boolean;
  status?: number;
  retryAfter?: number;
  constructor(message: string, opts: { retryable: boolean; reconnect?: boolean; status?: number; retryAfter?: number }) {
    super(message);
    this.retryable = opts.retryable;
    this.reconnect = opts.reconnect ?? false;
    this.status = opts.status;
    this.retryAfter = opts.retryAfter;
  }
}

export type RequestInit = {
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  body?: string;
  /** User-supplied host (self-hosted GitLab, webhook URL): go through the SSRF guard. */
  untrusted?: boolean;
  timeoutMs?: number;
  /** Names the thing being reached in "not found" errors, e.g. "repository". */
  thing?: string;
};

export type ApiResponse<T> = { status: number; data: T; text: string; headers: Headers };

export async function request<T = any>(service: string, url: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { "user-agent": "Issueit/1.0 (+https://issueit.app)", accept: "application/json", ...init.headers };
  let body = init.body;
  if (init.json !== undefined) {
    body = JSON.stringify(init.json);
    headers["content-type"] ??= "application/json";
  } else if (init.form) {
    body = new URLSearchParams(init.form).toString();
    headers["content-type"] ??= "application/x-www-form-urlencoded";
  }

  const timeoutMs = deliveryTimeout.getStore() ?? init.timeoutMs ?? 20_000;
  let status: number;
  let text: string;
  let resHeaders: Headers;
  try {
    if (init.untrusted) {
      const res = await safeFetch(url, { method: init.method ?? "GET", headers, body, timeoutMs });
      ({ status, text } = res);
      resHeaders = res.headers;
    } else {
      const res = await fetch(url, {
        method: init.method ?? "GET",
        headers,
        body,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      text = (await res.text()).slice(0, 256 * 1024);
      resHeaders = res.headers;
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new IntegrationError(err.message, { retryable: false });
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    const mid = service.replace(/^(The|Your) /, (m) => m.toLowerCase());
    throw new IntegrationError(timedOut ? `${service} didn't respond in time.` : `Couldn't reach ${mid}.`, { retryable: true });
  }

  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (status >= 200 && status < 300) return { status, data, text, headers: resHeaders };
  throw describeFailure(service, status, data, resHeaders, init.thing);
}

/** Pulls the human part out of the many shapes of API error body. */
export function providerMessage(data: any): string | undefined {
  if (!data) return undefined;
  if (typeof data === "string") return data.trim().slice(0, 200) || undefined;
  const candidates = [
    data.message,
    data.error_description,
    data.error?.message,
    typeof data.error === "string" ? data.error : undefined,
    data.errors?.[0]?.message,
    data.errorMessages?.[0],
    data.errors && typeof data.errors === "object" && !Array.isArray(data.errors) ? Object.values(data.errors)[0] : undefined,
    data.err,
  ];
  const found = candidates.find((c) => typeof c === "string" && c.trim());
  return found ? String(found).trim().slice(0, 200) : undefined;
}

function describeFailure(service: string, status: number, data: any, headers: Headers, thing = "destination"): IntegrationError {
  const detail = providerMessage(data);
  const said = detail ? ` ${service} said: "${detail.replace(/\.$/, "")}".` : "";
  const retryAfter = Number(headers.get("retry-after")) || undefined;
  if (status === 401) return new IntegrationError(`${service} rejected the saved credentials. Reconnect the account.`, { retryable: false, reconnect: true, status });
  if (status === 403) {
    const rateLimited = headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(detail ?? "");
    if (rateLimited) return new IntegrationError(`${service} is rate limiting requests. Issueit will try again.`, { retryable: true, status, retryAfter });
    return new IntegrationError(`${service} refused access. Check the account can create items in this ${thing}.${said}`, { retryable: false, status });
  }
  if (status === 404) return new IntegrationError(`${service} couldn't find the ${thing}. It may have been moved, renamed or deleted.`, { retryable: false, status });
  if (status === 429) return new IntegrationError(`${service} is rate limiting requests. Issueit will try again.`, { retryable: true, status, retryAfter });
  if (status >= 500) return new IntegrationError(`${service} had a problem (${status}). Issueit will try again.`, { retryable: true, status, retryAfter });
  return new IntegrationError(`${service} didn't accept the request.${said}`, { retryable: false, status });
}

/** GraphQL APIs report errors in a 200 response. */
export function graphqlErrors(service: string, data: any) {
  const errors = data?.errors;
  if (!Array.isArray(errors) || !errors.length) return;
  const first = errors[0];
  const code = first?.extensions?.code ?? first?.extensions?.type;
  if (code === "AUTHENTICATION_ERROR" || /authenticat/i.test(first?.message ?? ""))
    throw new IntegrationError(`${service} rejected the saved credentials. Reconnect the account.`, { retryable: false, reconnect: true });
  if (code === "RATELIMITED") throw new IntegrationError(`${service} is rate limiting requests. Issueit will try again.`, { retryable: true });
  throw new IntegrationError(`${service} didn't accept the request. ${service} said: "${String(first?.message ?? "unknown error").slice(0, 200)}".`, { retryable: false });
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
