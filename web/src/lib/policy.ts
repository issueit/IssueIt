import type { DeliveryPolicy } from "./types";

/** Mirrors server/delivery/policy.ts so settings can preview what a policy will do. */
const STANDARD = [30, 120, 600, 1800, 3600, 10800, 21600];

export function backoffSeconds(p: DeliveryPolicy, attempt: number): number {
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

/** Seconds after the first attempt at which each retry happens. */
export function retryTimes(p: DeliveryPolicy): number[] {
  const out: number[] = [];
  let at = p.sendDelaySeconds;
  for (let i = 1; i < p.maxAttempts; i++) {
    at += backoffSeconds(p, i);
    out.push(at);
  }
  return out;
}

export const merge = (base: DeliveryPolicy, override: Partial<DeliveryPolicy>): DeliveryPolicy => ({
  ...base,
  ...Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined && v !== null)),
});

/** Keeps only the values that differ from what would be inherited. */
export function sparse(base: DeliveryPolicy, value: Partial<DeliveryPolicy>): Partial<DeliveryPolicy> {
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => v !== undefined && v !== base[k as keyof DeliveryPolicy])) as Partial<DeliveryPolicy>;
}

export const backoffLabels: Record<DeliveryPolicy["backoff"], string> = {
  standard: "Standard schedule",
  exponential: "Exponential",
  linear: "Linear",
  fixed: "Fixed interval",
};
