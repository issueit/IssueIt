import { useEffect, useState, type ReactNode } from "react";
import { backoffLabels, merge, retryTimes } from "../../lib/policy";
import type { DeliveryPolicy } from "../../lib/types";
import { IconButton } from "../../components/ui/Button";
import { Switch } from "../../components/ui/controls";
import { Input, Select } from "../../components/ui/Field";
import { UndoLeftIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { formatSeconds } from "../dashboard/format";

export type PolicySection = "retries" | "pacing" | "payload";

/** A whole number typed in, clamped to its range when the field is left. */
export function NumberField({ value, onChange, min, max, unit, label, disabled }: { value: number; onChange: (n: number) => void; min: number; max: number; unit?: string; label: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    setText(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <span className="inline-unit">
      <Input
        size_="sm"
        type="number"
        inputMode="numeric"
        aria-label={label}
        className="num-input tabular"
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
      />
      {unit}
    </span>
  );
}

/**
 * Edits a sparse policy on top of inherited values. A row that differs from
 * what it inherits is marked custom and can be put back with one click.
 */
export function PolicyEditor({
  base,
  value,
  onChange,
  sections,
  inheritsFrom,
  disabled,
}: {
  base: DeliveryPolicy;
  value: Partial<DeliveryPolicy>;
  onChange: (v: Partial<DeliveryPolicy>) => void;
  sections: PolicySection[];
  inheritsFrom: string;
  disabled?: boolean;
}) {
  const p = merge(base, value);
  const set = <K extends keyof DeliveryPolicy>(key: K, v: DeliveryPolicy[K]) => {
    const next = { ...value };
    if (v === base[key]) delete next[key];
    else next[key] = v;
    onChange(next);
  };
  const reset = (key: keyof DeliveryPolicy) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const label = (key: keyof DeliveryPolicy, text: ReactNode) =>
    value[key] !== undefined && value[key] !== base[key] ? (
      <span className="inline-flex items-center gap-1.5">
        {text}
        <span className="chip">Custom</span>
        {!disabled && <IconButton size="sm" icon={UndoLeftIcon} label={`Use the ${inheritsFrom} (${String(base[key]) || "none"})`} onClick={() => reset(key)} />}
      </span>
    ) : (
      text
    );
  const toggle = (key: keyof DeliveryPolicy, text: string, hint: ReactNode) => (
    <SetRow label={label(key, text)} hint={hint}>
      <Switch label={text} checked={p[key] as boolean} disabled={disabled} onChange={(v) => set(key, v as never)} />
    </SetRow>
  );

  const times = retryTimes(p);
  const total = times.length ? times[times.length - 1] : 0;

  return (
    <>
      {sections.includes("retries") && (
        <>
          <SetGroup title="Retries">
            <SetRow label={label("maxAttempts", "Attempts")} hint="How many times Issueit tries before giving up. 1 means never retry.">
              <NumberField label="Attempts" value={p.maxAttempts} min={1} max={25} disabled={disabled} onChange={(n) => set("maxAttempts", n)} />
            </SetRow>
            <SetRow
              label={label("backoff", "Backoff")}
              hint={
                p.backoff === "standard"
                  ? "30s, 2m, 10m, 30m, 1h, 3h, then every 6h."
                  : p.backoff === "exponential"
                    ? "Doubles the wait after each failure."
                    : p.backoff === "linear"
                      ? "Adds the first delay again after each failure."
                      : "Waits the same time between every attempt."
              }
            >
              <Select
                small
                aria-label="Backoff"
                className="!w-[170px]"
                value={p.backoff}
                disabled={disabled}
                onChange={(e) => set("backoff", e.target.value as DeliveryPolicy["backoff"])}
                options={(Object.keys(backoffLabels) as DeliveryPolicy["backoff"][]).map((b) => ({ value: b, label: backoffLabels[b] }))}
              />
            </SetRow>
            {p.backoff !== "standard" && (
              <SetRow label={label("baseDelaySeconds", "First delay")} hint="The wait after the first failure.">
                <NumberField label="First delay" value={p.baseDelaySeconds} min={5} max={3600} unit="seconds" disabled={disabled} onChange={(n) => set("baseDelaySeconds", n)} />
              </SetRow>
            )}
            <SetRow label={label("maxDelaySeconds", "Longest wait")} hint="No single wait between attempts is longer than this.">
              <NumberField label="Longest wait" value={p.maxDelaySeconds} min={60} max={86400} unit="seconds" disabled={disabled} onChange={(n) => set("maxDelaySeconds", n)} />
            </SetRow>
            <SetRow label={label("timeoutSeconds", "Request timeout")} hint="How long to wait for the service to answer each request.">
              <NumberField label="Request timeout" value={p.timeoutSeconds} min={3} max={60} unit="seconds" disabled={disabled} onChange={(n) => set("timeoutSeconds", n)} />
            </SetRow>
            {toggle("respectRetryAfter", "Respect Retry-After", "When a service says how long to wait, wait at least that long.")}
            <div className="set-row">
              <div className="set-row__text">
                <div className="set-row__label">Schedule</div>
                <div className="set-row__hint">
                  {times.length ? `Retries ${times.length === 1 ? "once" : `${times.length} times`} over ${formatSeconds(total)}.` : "Tries once and stops."}
                </div>
                {times.length > 0 && (
                  <div className="schedule mt-1.5" aria-label="Retry times after the report arrives">
                    <span className="chip">{p.sendDelaySeconds ? `+${formatSeconds(p.sendDelaySeconds)}` : "Now"}</span>
                    {times.slice(0, 14).map((t, i) => (
                      <span key={i} className="chip tabular">
                        +{formatSeconds(t)}
                      </span>
                    ))}
                    {times.length > 14 && <span className="chip">+{times.length - 14} more</span>}
                  </div>
                )}
              </div>
            </div>
          </SetGroup>
          <SetGroup title="Retry when">
            {toggle("retryServerErrors", "The service has a problem", "5xx responses: usually temporary.")}
            {toggle("retryRateLimits", "The service is rate limiting", "429 responses and rate-limit refusals.")}
            {toggle("retryNetworkErrors", "The service can't be reached", "Timeouts, DNS and connection failures.")}
            {toggle("retryClientErrors", "The request is refused", "Other 4xx responses. Usually a setting is wrong, so retrying rarely helps. Expired credentials never retry.")}
          </SetGroup>
        </>
      )}

      {sections.includes("pacing") && (
        <SetGroup title="Pacing and safety">
          <SetRow label={label("sendDelaySeconds", "Delay before sending")} hint="Hold new deliveries for a while, e.g. to triage first. 0 sends at once.">
            <NumberField label="Delay before sending" value={p.sendDelaySeconds} min={0} max={3600} unit="seconds" disabled={disabled} onChange={(n) => set("sendDelaySeconds", n)} />
          </SetRow>
          <SetRow label={label("rateLimitPerMinute", "Rate limit")} hint="At most this many deliveries a minute; the rest wait their turn. 0 means no limit.">
            <NumberField label="Rate limit" value={p.rateLimitPerMinute} min={0} max={600} unit="per minute" disabled={disabled} onChange={(n) => set("rateLimitPerMinute", n)} />
          </SetRow>
          <SetRow label={label("autoPauseAfter", "Pause after failures")} hint="Pause the destination after this many failed deliveries in a row. 0 never pauses.">
            <NumberField label="Pause after failures" value={p.autoPauseAfter} min={0} max={100} unit="in a row" disabled={disabled} onChange={(n) => set("autoPauseAfter", n)} />
          </SetRow>
        </SetGroup>
      )}

      {sections.includes("payload") && (
        <SetGroup title="What the destination receives">
          <SetRow label={label("titlePrefix", "Title prefix")} hint={p.titlePrefix ? `Titles read "${p.titlePrefix} Checkout button does nothing".` : "Added before every title, e.g. [Bug]."}>
            <Input
              size_="sm"
              className="!w-[150px]"
              aria-label="Title prefix"
              maxLength={40}
              placeholder="None"
              defaultValue={p.titlePrefix}
              key={p.titlePrefix}
              disabled={disabled}
              onBlur={(e) => e.target.value !== p.titlePrefix && set("titlePrefix", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </SetRow>
          {toggle("includeDescription", "Description", "The reporter's details of what went wrong.")}
          {toggle("includeContext", "Browser and device", "Browser, OS, viewport, language and time zone.")}
          {toggle("includeMetadata", "Metadata", "Custom fields from the widget and setMetadata().")}
          {toggle("includeAttachments", "Attachment links", "Signed links to screenshots and files.")}
          {toggle("includeReporter", "Reporter's name and email", "Turn off to keep personal details inside Issueit.")}
          {toggle("includeDiagnostics", "Console, requests and steps", "What the widget saw on the page before the report was sent.")}
        </SetGroup>
      )}
    </>
  );
}
