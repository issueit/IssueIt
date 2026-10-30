import { useState } from "react";
import { describeError } from "../lib/api";
import { bytes, plural } from "../lib/format";
import { useProviders, useUsage, type Usage } from "../lib/queries";
import { Button } from "../components/ui/Button";
import { Callout, Skeleton } from "../components/ui/feedback";
import { SetGroup, SetRow } from "../components/ui/layout";
import { BrandIcon } from "../components/ui/BrandIcon";

/** Usage inside Settings. */
export function UsageSettings() {
  const usage = useUsage();
  return (
    <>
      <h2 className="page-title mb-4">Usage and limits</h2>
      {usage.isPending ? (
        <Skeleton h={140} />
      ) : usage.isError ? (
        <Callout tone="danger" action={<Button size="sm" onClick={() => usage.refetch()}>Try again</Button>}>
          {describeError(usage.error, "Couldn't load usage.")}
        </Callout>
      ) : (
        <UsageView u={usage.data} />
      )}
    </>
  );
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-[160px]">
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" role="meter" aria-label={label} aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "var(--danger)" : pct > 75 ? "var(--warning)" : "var(--text-2)" }} />
      </div>
      <div className="mt-1 text-right text-xs text-text-3 tabular">{Math.round(pct)}% used</div>
    </div>
  );
}

function UsageView({ u }: { u: Usage }) {
  const providers = useProviders();
  const name = (id: string) => providers.data?.providers.find((p) => p.id === id)?.name ?? id;
  const delivered = u.deliveries.delivered ?? 0;
  const failed = u.deliveries.failed ?? 0;
  const waiting = (u.deliveries.retrying ?? 0) + (u.deliveries.pending ?? 0) + (u.deliveries.delivering ?? 0);
  const month = new Date().toLocaleDateString("en-GB", { month: "long" });

  return (
    <>
      <SetGroup title={`Reports in ${month}`}>
        <div className="p-3.5">
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-2xl font-semibold tabular">{u.reports.month.toLocaleString("en-GB")}</span>
            <span className="text-sm text-text-3">
              {u.reports.lastMonth ? `${u.reports.lastMonth.toLocaleString("en-GB")} last month` : "None last month"} · {u.reports.total.toLocaleString("en-GB")} in total
            </span>
          </div>
          <DailyChart days={u.reports.daily} />
        </div>
        {u.limits.reportsPerMonth && (
          <SetRow label="Monthly limit" hint={`${u.reports.month.toLocaleString("en-GB")} of ${u.limits.reportsPerMonth.toLocaleString("en-GB")} reports. New reports are refused once it's reached.`}>
            <Meter value={u.reports.month} max={u.limits.reportsPerMonth} label="Monthly report limit" />
          </SetRow>
        )}
      </SetGroup>

      <SetGroup title="Attachments">
        <SetRow label="Storage used" hint={`${plural(u.storage.files, "file")} in total, ${u.storage.monthFiles} added this month.`}>
          {u.limits.storageBytes ? (
            <Meter value={u.storage.bytes} max={u.limits.storageBytes} label="Storage" />
          ) : (
            <span className="text-sm tabular">{bytes(u.storage.bytes)}</span>
          )}
        </SetRow>
        <SetRow label="Per report" hint="What each report can carry.">
          <span className="text-sm text-text-2">
            Up to {u.limits.attachmentsPerReport} files, {bytes(u.limits.attachmentBytes)} each
          </span>
        </SetRow>
      </SetGroup>

      <SetGroup title={`Deliveries in ${month}`}>
        <SetRow label="Delivered" hint="Issues, cards, messages and webhook events sent, not counting tests.">
          <span className="text-sm tabular">{delivered.toLocaleString("en-GB")}</span>
        </SetRow>
        <SetRow label="Failed" hint={failed ? "Retry them from the report or the project's delivery log." : "Nothing has failed this month."}>
          <span className={`text-sm tabular ${failed ? "text-danger" : ""}`}>{failed.toLocaleString("en-GB")}</span>
        </SetRow>
        {waiting > 0 && (
          <SetRow label="Waiting" hint="Queued or retrying.">
            <span className="text-sm tabular">{waiting}</span>
          </SetRow>
        )}
        {u.deliveriesByProvider.map((p) => (
          <SetRow key={p.provider} label={<span className="inline-flex items-center gap-2"><BrandIcon provider={p.provider} size={13} />{name(p.provider)}</span>}>
            <span className="text-sm tabular text-text-2">{p.n.toLocaleString("en-GB")}</span>
          </SetRow>
        ))}
      </SetGroup>
    </>
  );
}

/** Thirty quiet bars. Hover or focus a day to read its count. */
function DailyChart({ days }: { days: Array<{ day: string; n: number }> }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.n));
  const shown = active !== null ? days[active] : null;
  return (
    <div>
      <div className="flex items-end gap-[3px] h-16" role="img" aria-label={`Reports per day for the last 30 days, up to ${max} a day`}>
        {days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            className="flex-1 h-full flex items-end rounded-[2px] focus-visible:outline-2"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={`${new Date(d.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: ${plural(d.n, "report")}`}
          >
            <span
              className="w-full rounded-[2px] transition-colors"
              style={{ height: `${Math.max(d.n ? 6 : 2, (d.n / max) * 100)}%`, background: active === i ? "var(--text)" : d.n ? "var(--hue-0)" : "var(--border)" }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-text-3">
        <span>{shown ? new Date(shown.day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "30 days ago"}</span>
        <span className="tabular">{shown ? plural(shown.n, "report") : "Today"}</span>
      </div>
    </div>
  );
}
