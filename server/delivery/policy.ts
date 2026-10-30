import { z } from "zod";
import type { DeliveryPolicy } from "../db/schema";
import type { IntegrationError } from "../integrations/http";
import type { ReportPayload } from "../integrations/types";

export type EffectivePolicy = Required<DeliveryPolicy>;

/** What a destination does when neither it nor its organisation says otherwise. */
export const defaultPolicy: EffectivePolicy = {
  maxAttempts: 8,
  backoff: "standard",
  baseDelaySeconds: 30,
  maxDelaySeconds: 21600,
  timeoutSeconds: 20,
  respectRetryAfter: true,
  retryServerErrors: true,
  retryRateLimits: true,
  retryNetworkErrors: true,
  retryClientErrors: false,
  sendDelaySeconds: 0,
  rateLimitPerMinute: 0,
  autoPauseAfter: 0,
  titlePrefix: "",
  includeDescription: true,
  includeContext: true,
  includeMetadata: true,
  includeAttachments: true,
  includeReporter: true,
  includeDiagnostics: true,
};

/** Accepts a sparse policy; omitted keys fall through to the next level. */
export const policySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(25),
    backoff: z.enum(["standard", "exponential", "linear", "fixed"]),
    baseDelaySeconds: z.number().int().min(5).max(3600),
    maxDelaySeconds: z.number().int().min(60).max(86400),
    timeoutSeconds: z.number().int().min(3).max(60),
    respectRetryAfter: z.boolean(),
    retryServerErrors: z.boolean(),
    retryRateLimits: z.boolean(),
    retryNetworkErrors: z.boolean(),
    retryClientErrors: z.boolean(),
    sendDelaySeconds: z.number().int().min(0).max(3600),
    rateLimitPerMinute: z.number().int().min(0).max(600),
    autoPauseAfter: z.number().int().min(0).max(100),
    titlePrefix: z.string().max(40),
    includeDescription: z.boolean(),
    includeContext: z.boolean(),
    includeMetadata: z.boolean(),
    includeAttachments: z.boolean(),
    includeReporter: z.boolean(),
    includeDiagnostics: z.boolean(),
  })
  .partial();

/** Drops undefined keys so a sparse override never blanks a default. */
const defined = (p: DeliveryPolicy | null | undefined) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null));

export function effectivePolicy(org: DeliveryPolicy | null | undefined, destination: DeliveryPolicy | null | undefined): EffectivePolicy {
  return { ...defaultPolicy, ...defined(org), ...defined(destination) } as EffectivePolicy;
}

/** The fixed schedule Issueit has always used: 30s, 2m, 10m, 30m, 1h, 3h, 6h. */
const STANDARD = [30, 120, 600, 1800, 3600, 10800, 21600];

/** Seconds to wait after the given failed attempt (1-based). */
export function backoffSeconds(p: EffectivePolicy, attempt: number): number {
  const n = Math.max(1, attempt);
  let wait: number;
  switch (p.backoff) {
    case "exponential":
      wait = p.baseDelaySeconds * 2 ** (n - 1);
      break;
    case "linear":
      wait = p.baseDelaySeconds * n;
      break;
    case "fixed":
      wait = p.baseDelaySeconds;
      break;
    default:
      wait = STANDARD[Math.min(n - 1, STANDARD.length - 1)];
  }
  return Math.min(wait, p.maxDelaySeconds);
}

/** The whole schedule, for showing people what a policy will do. */
export function retrySchedule(p: EffectivePolicy): number[] {
  return Array.from({ length: Math.max(0, p.maxAttempts - 1) }, (_, i) => backoffSeconds(p, i + 1));
}

/** Whether this policy wants another attempt after this failure. Credential problems never retry. */
export function shouldRetry(p: EffectivePolicy, err: IntegrationError | null): boolean {
  if (!err) return p.retryNetworkErrors;
  if (err.reconnect) return false;
  const status = err.status;
  if (status === 429 || (status === 403 && err.retryable)) return p.retryRateLimits;
  if (status && status >= 500) return p.retryServerErrors;
  if (!status) return err.retryable ? p.retryNetworkErrors : false;
  if (status >= 400 && status < 500) return err.retryable || p.retryClientErrors;
  return err.retryable;
}

/** Shapes the report a destination receives. Issueit keeps the full report either way. */
export function shapeReport(report: ReportPayload, p: EffectivePolicy): ReportPayload {
  return {
    ...report,
    title: p.titlePrefix ? `${p.titlePrefix.trimEnd()} ${report.title}`.slice(0, 250) : report.title,
    description: p.includeDescription ? report.description : "",
    context: p.includeContext ? report.context : {},
    browser: p.includeContext ? report.browser : null,
    metadata: p.includeMetadata ? report.metadata : {},
    attachments: p.includeAttachments ? report.attachments : [],
    reporter: p.includeReporter ? report.reporter : { email: null, name: null },
    diagnostics: p.includeDiagnostics ? report.diagnostics : {},
  };
}

/** A per-destination sliding window, so a burst of reports doesn't trip a service's rate limit. */
const sent = new Map<string, number[]>();

/** Returns 0 if a delivery may go now, or the seconds to wait for a slot. */
export function takeSlot(destinationId: string, perMinute: number): number {
  if (!perMinute) return 0;
  const now = Date.now();
  const recent = (sent.get(destinationId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) {
    sent.set(destinationId, recent);
    return Math.max(1, Math.ceil((recent[0] + 60_000 - now) / 1000));
  }
  recent.push(now);
  sent.set(destinationId, recent);
  return 0;
}
