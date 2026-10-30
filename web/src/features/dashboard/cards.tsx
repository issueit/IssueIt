import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import type { ChartConfiguration, ChartDataset } from "chart.js";
import type { CardId, ChartKind, DashboardPrefs, KpiId } from "../../lib/preferences";
import { kpiLabels } from "../../lib/preferences";
import type { Analytics, Count, Destination, ReportListItem } from "../../lib/types";
import { relativeTime } from "../../lib/format";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { StatusPill } from "../../components/ui/feedback";
import { PriorityLabel, ReportStatusPill } from "../../components/app/status";
import { baseOptions, ChartCanvas, type VizTheme } from "./chart";
import { WorldMap } from "./WorldMap";
import { bucketLabel, countryName, delta, formatMs, formatNumber, priorityLabel, priorityOrder, sourceLabel, statusLabel, topWithOther } from "./format";

export type CardContext = {
  data: Analytics;
  prefs: DashboardPrefs;
  theme: VizTheme;
  height: number;
  kind: ChartKind;
  wide: boolean;
  providerName: (id: string) => string;
  recent: ReportListItem[] | undefined;
  destinations: Destination[] | undefined;
};

type Row = { key: string; label: string; n: number; color?: string };

/* ------------------------------------------------------------------ shared pieces */

/** The table view every chart offers, for reading exact values or when colour isn't enough. */
export function DataTable({ columns, rows }: { columns: string[]; rows: Array<Array<ReactNode>> }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="viz-table-wrap">
      <table className="viz-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={i ? "num" : ""}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={j ? "num tabular" : ""}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ children = "Nothing in this period." }: { children?: ReactNode }) {
  return <div className="viz-empty">{children}</div>;
}

/** Categorical colours follow the entity: a key keeps its colour whatever else is shown. */
function colourFor(key: string, order: string[], theme: VizTheme) {
  if (key === "__other") return theme.other;
  const i = order.indexOf(key);
  return theme.series[(i >= 0 ? i : order.length) % theme.series.length];
}

/** Bars, horizontal bars or a doughnut for one breakdown. */
function Breakdown({ rows, ctx, label, ordered }: { rows: Row[]; ctx: CardContext; label: string; ordered?: boolean }) {
  const { kind, theme, prefs, height } = ctx;
  const total = rows.reduce((n, r) => n + r.n, 0);
  const config = useMemo((): ChartConfiguration<"bar" | "doughnut" | "pie"> | null => {
    if (!rows.length || kind === "table" || kind === "list") return null;
    const labels = rows.map((r) => r.label);
    const values = rows.map((r) => r.n);
    if (kind === "doughnut" || kind === "pie") {
      return {
        type: kind,
        data: { labels, datasets: [{ label, data: values, backgroundColor: rows.map((r) => r.color ?? theme.series[0]), borderColor: theme.surface, borderWidth: 2, hoverOffset: 3 }] },
        options: {
          ...baseOptions(theme, { grid: false, animations: prefs.animations, legend: prefs.legend, axes: false }),
          interaction: { mode: "nearest", intersect: true },
          cutout: kind === "doughnut" ? "64%" : 0,
        } as ChartConfiguration<"doughnut">["options"],
      };
    }
    const horizontal = kind === "hbar";
    return {
      type: "bar",
      data: {
        labels,
        // One series, one colour - unless the categories are ordered, where the ramp carries the order.
        datasets: [{ label, data: values, backgroundColor: rows.map((r) => (ordered ? (r.color ?? theme.series[0]) : theme.series[0])), borderRadius: 4, borderSkipped: "start", maxBarThickness: 22, categoryPercentage: 0.8 }],
      },
      options: {
        ...baseOptions(theme, { grid: prefs.grid, animations: prefs.animations, legend: false, horizontal, values: prefs.values }),
        plugins: {
          ...baseOptions(theme, { grid: prefs.grid, animations: prefs.animations, legend: false, values: prefs.values }).plugins,
          tooltip: { ...baseOptions(theme, { grid: false, animations: false, legend: false }).plugins.tooltip, displayColors: false },
        },
      } as ChartConfiguration<"bar">["options"],
    };
  }, [rows, kind, theme, prefs.animations, prefs.legend, prefs.grid, prefs.values, label, ordered]);

  if (!rows.length || !total) return <Empty />;
  if (kind === "table" || !config)
    return <DataTable columns={[label, "Reports", "Share"]} rows={rows.map((r) => [r.label, formatNumber(r.n, prefs.numbers), `${Math.round((r.n / total) * 100)}%`])} />;
  const chartHeight = kind === "hbar" ? Math.min(height, Math.max(90, rows.length * 30 + 20)) : height;
  return (
    <div className="viz-breakdown">
      <ChartCanvas config={config as ChartConfiguration} height={chartHeight} label={`${label}: ${rows.map((r) => `${r.label} ${r.n}`).join(", ")}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

function Kpis({ ctx }: { ctx: CardContext }) {
  const t = ctx.data.totals;
  const n = (v: number) => formatNumber(v, ctx.prefs.numbers);
  const finished = t.delivered + t.failed;
  const values: Record<KpiId, { value: string; hint?: string; change?: number | null; bad?: boolean; good?: "up" | "down" }> = {
    reports: { value: n(t.reports), change: ctx.prefs.compare ? delta(t.reports, t.previousReports) : null, hint: ctx.prefs.compare ? `${n(t.previousReports)} the period before` : undefined },
    open: { value: n(t.open), hint: "New or investigating" },
    resolved: { value: n(t.resolved), hint: t.reports ? `${Math.round((t.resolved / t.reports) * 100)}% of the period's reports` : undefined },
    reporters: { value: n(t.reporters), hint: "Distinct email addresses" },
    delivered: { value: n(t.delivered), hint: t.waiting ? `${n(t.waiting)} waiting` : "Nothing waiting" },
    successRate: { value: finished ? `${((t.delivered / finished) * 100).toFixed(finished > 200 ? 1 : 0)}%` : "-", hint: t.failed ? `${n(t.failed)} failed` : "No failures", bad: !!finished && t.delivered / finished < 0.95 },
    failing: { value: n(t.failingDestinations), hint: t.failingDestinations ? "Last delivery failed" : "All healthy", bad: t.failingDestinations > 0 },
    latency: { value: formatMs(t.p50DeliveryMs), hint: t.p95DeliveryMs !== null ? `95% within ${formatMs(t.p95DeliveryMs)}` : "No deliveries yet" },
    attachments: { value: n(t.withAttachments), hint: "Reports with files" },
  };
  const ids = ctx.prefs.kpis.length ? ctx.prefs.kpis : (["reports"] as KpiId[]);
  if (ctx.kind === "table") return <DataTable columns={["Measure", "Value"]} rows={ids.map((id) => [kpiLabels[id], values[id].value])} />;
  return (
    <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${ctx.wide ? 150 : 130}px, 1fr))` }}>
      {ids.map((id) => {
        const v = values[id];
        return (
          <div key={id} className="kpi">
            <div className="kpi__label">{kpiLabels[id]}</div>
            <div className="kpi__value" data-bad={v.bad || undefined}>
              {v.value}
              {v.change !== null && v.change !== undefined && (
                <span className="kpi__delta" aria-label={`${v.change >= 0 ? "Up" : "Down"} ${Math.abs(v.change)}% on the period before`}>
                  {v.change >= 0 ? "↑" : "↓"} {Math.abs(v.change)}%
                </span>
              )}
            </div>
            {v.hint && <div className="kpi__hint">{v.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Volume({ ctx }: { ctx: CardContext }) {
  const { data, theme, prefs, kind, height } = ctx;
  const labels = data.series.map((s) => bucketLabel(s.bucket, data.unit));
  const totals = data.series.map((s) => s.low + s.medium + s.high + s.critical);
  const config = useMemo((): ChartConfiguration<"bar" | "line"> | null => {
    if (kind === "table") return null;
    const area = kind === "area";
    const line = kind === "line" || area;
    const previous: ChartDataset<"line"> | null =
      prefs.compare && data.previousSeries.length
        ? {
            type: "line",
            label: "Period before",
            data: data.previousSeries.slice(-labels.length),
            borderColor: theme.text3,
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: prefs.smooth ? 0.35 : 0,
            fill: false,
            order: 0,
          }
        : null;
    const datasets: ChartDataset<"bar" | "line">[] = [];
    if (!line && prefs.stackPriority) {
      // Low to critical, so critical sits on top of each stack.
      [...priorityOrder].reverse().forEach((p, i) =>
        datasets.push({ type: "bar", label: priorityLabel[p], data: data.series.map((s) => s[p]), backgroundColor: theme.ordinal[i], borderRadius: 3, borderSkipped: "start", maxBarThickness: 28, stack: "r", order: 1 }),
      );
    } else if (!line) {
      datasets.push({ type: "bar", label: "Reports", data: totals, backgroundColor: theme.series[0], borderRadius: 4, borderSkipped: "start", maxBarThickness: 28, order: 1 });
    } else {
      datasets.push({
        type: "line",
        label: "Reports",
        data: totals,
        borderColor: theme.series[0],
        backgroundColor: area ? `${theme.series[0]}2e` : theme.series[0],
        fill: area ? "origin" : false,
        borderWidth: 2,
        pointRadius: totals.length > 40 ? 0 : 2.5,
        pointHoverRadius: 4,
        tension: prefs.smooth ? 0.35 : 0,
        order: 1,
      });
    }
    if (previous) datasets.push(previous);
    const multi = datasets.length > 1;
    return {
      type: "bar",
      data: { labels, datasets: datasets as ChartDataset<"bar">[] },
      options: {
        ...baseOptions(theme, { grid: prefs.grid, animations: prefs.animations, legend: multi ? prefs.legend : false, stacked: !line && prefs.stackPriority, values: prefs.values }),
        plugins: {
          ...baseOptions(theme, { grid: prefs.grid, animations: prefs.animations, legend: multi ? prefs.legend : false, values: prefs.values }).plugins,
          tooltip: {
            ...baseOptions(theme, { grid: false, animations: false, legend: false }).plugins.tooltip,
            callbacks: { title: (items) => bucketLabel(data.series[items[0].dataIndex]?.bucket ?? "", data.unit, true) },
          },
        },
      } as ChartConfiguration<"bar">["options"],
    };
  }, [kind, data, theme, prefs.compare, prefs.smooth, prefs.stackPriority, prefs.grid, prefs.animations, prefs.legend, prefs.values, labels, totals]);

  if (!totals.some(Boolean) && !data.previousSeries.some(Boolean)) return <Empty />;
  if (!config)
    return (
      <DataTable
        columns={["Period", ...priorityOrder.map((p) => priorityLabel[p]), "Total", ...(prefs.compare ? ["Before"] : [])]}
        rows={data.series.map((s, i) => [
          bucketLabel(s.bucket, data.unit, true),
          ...priorityOrder.map((p) => s[p]),
          totals[i],
          ...(prefs.compare ? [data.previousSeries[i] ?? 0] : []),
        ])}
      />
    );
  return <ChartCanvas config={config as ChartConfiguration} height={height} label={`Reports per ${data.unit}: ${totals.reduce((a, b) => a + b, 0)} in total`} />;
}

function Deliveries({ ctx }: { ctx: CardContext }) {
  const { data, theme, prefs, kind, height } = ctx;
  const config = useMemo((): ChartConfiguration<"bar" | "line"> | null => {
    if (kind === "table") return null;
    const line = kind === "line";
    // Outcomes are states, so they wear the status colours, always with their names in the legend.
    const sets: Array<[string, keyof Analytics["deliverySeries"][number], string]> = [
      ["Delivered", "delivered", theme.success],
      ["Failed", "failed", theme.danger],
      ["Waiting", "waiting", theme.warning],
    ];
    return {
      type: line ? "line" : "bar",
      data: {
        labels: data.deliverySeries.map((s) => bucketLabel(s.bucket, data.unit)),
        datasets: sets.map(([label, key, colour]) => ({
          label,
          data: data.deliverySeries.map((s) => s[key] as number),
          backgroundColor: colour,
          borderColor: colour,
          borderWidth: line ? 2 : 0,
          borderRadius: line ? 0 : 3,
          borderSkipped: "start" as const,
          maxBarThickness: 28,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: prefs.smooth ? 0.35 : 0,
          stack: line ? undefined : "d",
        })),
      },
      options: {
        ...baseOptions(theme, { grid: prefs.grid, animations: prefs.animations, legend: prefs.legend, stacked: !line }),
        plugins: {
          ...baseOptions(theme, { grid: prefs.grid, animations: prefs.animations, legend: prefs.legend }).plugins,
          tooltip: {
            ...baseOptions(theme, { grid: false, animations: false, legend: false }).plugins.tooltip,
            callbacks: { title: (items) => bucketLabel(data.deliverySeries[items[0].dataIndex]?.bucket ?? "", data.unit, true) },
          },
        },
      } as ChartConfiguration<"bar">["options"],
    };
  }, [kind, data, theme, prefs.smooth, prefs.grid, prefs.animations, prefs.legend]);
  const any = data.deliverySeries.some((s) => s.delivered || s.failed || s.waiting);
  if (!any) return <Empty>No deliveries in this period.</Empty>;
  if (!config)
    return <DataTable columns={["Period", "Delivered", "Failed", "Waiting"]} rows={data.deliverySeries.map((s) => [bucketLabel(s.bucket, data.unit, true), s.delivered, s.failed, s.waiting])} />;
  return <ChartCanvas config={config as ChartConfiguration} height={height} label={`Deliveries per ${data.unit}`} />;
}

function Providers({ ctx }: { ctx: CardContext }) {
  const { data, theme, prefs, kind, height, providerName } = ctx;
  const rows = data.breakdowns.provider.slice(0, prefs.topN + 2);
  const config = useMemo((): ChartConfiguration<"bar"> | null => {
    if (kind === "table" || !rows.length) return null;
    return {
      type: "bar",
      data: {
        labels: rows.map((r) => providerName(r.key)),
        datasets: [
          { label: "Delivered", data: rows.map((r) => r.delivered), backgroundColor: theme.success, borderRadius: 3, borderSkipped: "start", maxBarThickness: 18, stack: "p" },
          { label: "Failed", data: rows.map((r) => r.failed), backgroundColor: theme.danger, borderRadius: 3, borderSkipped: "start", maxBarThickness: 18, stack: "p" },
        ],
      },
      options: baseOptions(theme, { grid: prefs.grid, animations: prefs.animations, legend: prefs.legend, horizontal: true, stacked: true }) as ChartConfiguration<"bar">["options"],
    };
  }, [kind, rows, theme, prefs.grid, prefs.animations, prefs.legend, providerName]);
  if (!rows.length) return <Empty>No deliveries in this period.</Empty>;
  if (!config)
    return (
      <DataTable
        columns={["Integration", "Delivered", "Failed", "Success"]}
        rows={rows.map((r) => [
          <span className="inline-flex items-center gap-2" key={r.key}>
            <BrandIcon provider={r.key} size={13} />
            {providerName(r.key)}
          </span>,
          r.delivered,
          r.failed,
          `${Math.round((r.delivered / Math.max(1, r.delivered + r.failed)) * 100)}%`,
        ])}
      />
    );
  return <ChartCanvas config={config} height={Math.min(height + 40, Math.max(110, rows.length * 32 + 50))} label="Deliveries by integration" />;
}

function MapCard({ ctx }: { ctx: CardContext }) {
  const { data, prefs, kind, theme, height, wide } = ctx;
  const countries = data.breakdowns.country;
  const total = countries.reduce((n, c) => n + c.n, 0);
  if (!countries.length) return <Empty>No locations yet. Reports from the widget carry the sender's time zone; Issueit maps it to a country.</Empty>;
  const rows: Row[] = countries.map((c) => ({ key: c.key, label: countryName(c.key), n: c.n }));
  if (kind === "table") return <DataTable columns={["Country", "Reports", "Share"]} rows={rows.map((r) => [r.label, formatNumber(r.n, prefs.numbers), `${Math.round((r.n / total) * 100)}%`])} />;
  if (kind === "hbar") {
    const top = topWithOther(rows, prefs.topN + 2).map((r) => ({ key: r.key, n: r.n, label: r.key === "__other" ? "Other" : countryName(r.key) }));
    return <Breakdown rows={top} ctx={ctx} label="Country" />;
  }
  const list = prefs.mapList ? rows.slice(0, 7) : [];
  return (
    <div className={`map-card ${wide && list.length ? "map-card--side" : ""}`}>
      <div className="min-w-0 flex-1">
        <WorldMap countries={countries} theme={theme} height={Math.max(height, 200) + (wide ? 40 : 0)} scale={prefs.mapScale} animations={prefs.animations} />
      </div>
      {list.length > 0 && (
        <ol className="rank-list">
          {list.map((r) => (
            <li key={r.key}>
              <span className="rank-list__name">{r.label}</span>
              <span className="rank-list__bar" style={{ width: `${(r.n / list[0].n) * 100}%` }} aria-hidden />
              <span className="tabular rank-list__n">{formatNumber(r.n, prefs.numbers)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Heatmap({ ctx }: { ctx: CardContext }) {
  const { data, kind, prefs } = ctx;
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const h of data.heatmap) g[h.dow - 1][h.hour] = h.n;
    return g;
  }, [data.heatmap]);
  const max = Math.max(0, ...grid.flat());
  if (!max) return <Empty />;
  if (kind === "table")
    return <DataTable columns={["Day", "Night (0-6)", "Morning (6-12)", "Afternoon (12-18)", "Evening (18-24)"]} rows={grid.map((row, i) => [DAYS[i], ...[0, 6, 12, 18].map((s) => row.slice(s, s + 6).reduce((a, b) => a + b, 0))])} />;
  return (
    <div className="heat" role="table" aria-label={`Reports by weekday and hour in ${data.timezone}`}>
      {grid.map((row, d) => (
        <div className="heat__row" role="row" key={d}>
          <span className="heat__day" role="rowheader">
            {DAYS[d]}
          </span>
          {row.map((n, h) => (
            <span
              key={h}
              role="cell"
              className="heat__cell"
              title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 - ${n} ${n === 1 ? "report" : "reports"}`}
              aria-label={`${DAYS[d]} ${h}:00, ${n} reports`}
              style={{ ["--k" as string]: n ? 0.18 + (0.82 * n) / max : 0 }}
            />
          ))}
        </div>
      ))}
      <div className="heat__row heat__hours" aria-hidden>
        <span className="heat__day" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="heat__hour">
            {h % 6 === 0 ? `${String(h).padStart(2, "0")}` : ""}
          </span>
        ))}
      </div>
      <div className="heat__legend">
        <span>Fewer</span>
        {[0.18, 0.4, 0.6, 0.8, 1].map((k) => (
          <span key={k} className="heat__cell" style={{ ["--k" as string]: k }} />
        ))}
        <span>More · {formatNumber(max, prefs.numbers)} at most in an hour</span>
      </div>
    </div>
  );
}

function Pages({ ctx }: { ctx: CardContext }) {
  const rows = ctx.data.breakdowns.page.slice(0, ctx.prefs.topN + 4);
  if (!rows.length) return <Empty>No page addresses in this period.</Empty>;
  if (ctx.kind === "hbar") return <Breakdown rows={rows.map((r) => ({ key: r.key, label: r.key.replace(/^[^/]+/, "") || "/", n: r.n }))} ctx={ctx} label="Page" />;
  if (ctx.kind === "table") return <DataTable columns={["Page", "Reports"]} rows={rows.map((r) => [<span className="mono" key={r.key}>{r.key}</span>, r.n])} />;
  return (
    <ol className="rank-list rank-list--full">
      {rows.map((r) => (
        <li key={r.key} title={r.key}>
          <span className="rank-list__name mono">{r.key}</span>
          <span className="rank-list__bar" style={{ width: `${(r.n / rows[0].n) * 100}%` }} aria-hidden />
          <span className="tabular rank-list__n">{formatNumber(r.n, ctx.prefs.numbers)}</span>
        </li>
      ))}
    </ol>
  );
}

function Recent({ ctx }: { ctx: CardContext }) {
  if (!ctx.recent) return <Empty>Loading…</Empty>;
  if (!ctx.recent.length) return <Empty>No reports yet. They appear here the moment they arrive.</Empty>;
  return (
    <div className="dash-list">
      {ctx.recent.slice(0, 7).map((r) => (
        <Link key={r.id} to={`/projects/${r.projectId}/reports/${r.id}`} className="dash-list__row">
          <PriorityLabel priority={r.priority} showText={false} />
          <span className="flex-1 truncate">{r.title}</span>
          <span className="hidden sm:inline text-xs text-text-3 truncate max-w-[110px]">{r.projectName}</span>
          <ReportStatusPill status={r.status} />
          <span className="w-12 text-right text-xs text-text-3">{relativeTime(r.createdAt, false)}</span>
        </Link>
      ))}
    </div>
  );
}

function Attention({ ctx }: { ctx: CardContext }) {
  const list = (ctx.destinations ?? []).filter((d) => d.connection?.status === "error" || (d.enabled && d.stats.lastStatus === "failed") || d.pausedReason || d.stats.pending > 5);
  if (!ctx.destinations) return <Empty>Loading…</Empty>;
  if (!list.length) return <Empty>Every destination is delivering. Nothing needs you.</Empty>;
  return (
    <div className="dash-list">
      {list.slice(0, 7).map((d) => (
        <Link key={d.id} to={`/integrations/${d.provider}`} className="dash-list__row">
          <BrandIcon provider={d.provider} size={14} />
          <span className="flex-1 min-w-0">
            <span className="block truncate">{d.name}</span>
            <span className="block truncate text-xs text-text-3">
              {d.projectName} · {d.pausedReason ?? d.connection?.lastError ?? d.stats.lastError ?? `${d.stats.pending} waiting`}
            </span>
          </span>
          {d.pausedReason ? (
            <StatusPill tone="warning" plain>
              Paused
            </StatusPill>
          ) : d.connection?.status === "error" ? (
            <StatusPill tone="danger" plain>
              Reconnect
            </StatusPill>
          ) : d.stats.lastStatus === "failed" ? (
            <StatusPill tone="danger" plain>
              Failing
            </StatusPill>
          ) : (
            <StatusPill tone="warning" plain>
              Backlog
            </StatusPill>
          )}
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ breakdown wiring */

const STATUS_ORDER = ["new", "investigating", "resolved", "closed"];

function breakdownRows(id: CardId, ctx: CardContext): { rows: Row[]; label: string; ordered?: boolean } {
  const b = ctx.data.breakdowns;
  const { theme, prefs } = ctx;
  const named = (rows: Count[], name: (k: string) => string, order?: string[]) => {
    const folded = topWithOther(rows, prefs.topN);
    const keys = order ?? rows.map((r) => r.key);
    return folded.map((r) => ({ key: r.key, label: r.key === "__other" ? "Other" : name(r.key), n: r.n, color: colourFor(r.key, keys, theme) }));
  };
  switch (id) {
    case "status":
      return { label: "Status", rows: named([...b.status].sort((a, z) => STATUS_ORDER.indexOf(a.key) - STATUS_ORDER.indexOf(z.key)), (k) => statusLabel[k] ?? k, STATUS_ORDER) };
    case "priority": {
      const rows = priorityOrder.map((p) => ({ key: p, label: priorityLabel[p], n: b.priority.find((x) => x.key === p)?.n ?? 0, color: theme.ordinal[3 - priorityOrder.indexOf(p)] }));
      return { label: "Priority", rows: rows.some((r) => r.n) ? rows : [], ordered: true };
    }
    case "source":
      return { label: "Source", rows: named(b.source, sourceLabel, ["widget", "form", "api"]) };
    case "browser":
      return { label: "Browser", rows: named(b.browser, (k) => k) };
    case "os":
      return { label: "Operating system", rows: named(b.os, (k) => k) };
    case "device":
      return { label: "Device", rows: named(b.device, (k) => k, ["Desktop", "Mobile", "Tablet"]) };
    case "environment":
      return { label: "Environment", rows: named(b.environment, (k) => (k === "none" ? "Not set" : k)) };
    case "projects":
      return { label: "Project", rows: named(b.project.map((p) => ({ key: p.key, n: p.n })), (k) => b.project.find((p) => p.key === k)?.name ?? k).filter((r) => r.n) };
    default:
      return { label: "", rows: [] };
  }
}

/** The body of a card, by id. */
export function CardBody({ id, ctx }: { id: CardId; ctx: CardContext }) {
  switch (id) {
    case "kpis":
      return <Kpis ctx={ctx} />;
    case "volume":
      return <Volume ctx={ctx} />;
    case "deliveries":
      return <Deliveries ctx={ctx} />;
    case "providers":
      return <Providers ctx={ctx} />;
    case "map":
      return <MapCard ctx={ctx} />;
    case "heatmap":
      return <Heatmap ctx={ctx} />;
    case "pages":
      return <Pages ctx={ctx} />;
    case "recent":
      return <Recent ctx={ctx} />;
    case "attention":
      return <Attention ctx={ctx} />;
    default: {
      const { rows, label, ordered } = breakdownRows(id, ctx);
      return <Breakdown rows={rows} ctx={ctx} label={label} ordered={ordered} />;
    }
  }
}

/** A short figure for the card header, so the headline is readable without the chart. */
export function cardSummary(id: CardId, data: Analytics, numbers: "compact" | "full"): string | null {
  const t = data.totals;
  const n = (v: number) => formatNumber(v, numbers);
  switch (id) {
    case "volume":
      return `${n(t.reports)} reports`;
    case "deliveries":
      return `${n(t.delivered)} delivered · ${n(t.failed)} failed`;
    case "map":
      return `${data.breakdowns.country.length} ${data.breakdowns.country.length === 1 ? "country" : "countries"}`;
    case "status":
      return `${n(t.open)} open`;
    case "priority": {
      const urgent = data.breakdowns.priority.filter((p) => p.key === "critical" || p.key === "high").reduce((a, p) => a + p.n, 0);
      return `${n(urgent)} high or critical`;
    }
    default:
      return null;
  }
}
