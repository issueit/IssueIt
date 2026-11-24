import { useMemo } from "react";
import { Link } from "react-router";
import type { ChartConfiguration } from "chart.js";
import { describeError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { usePreferences } from "../../lib/preferences";
import { useAnalytics, useOrgDestinations, useProjects, useReports } from "../../lib/queries";
import type { Analytics, AnalyticsRange, Destination, ReportListItem } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Segmented } from "../../components/ui/controls";
import { Select } from "../../components/ui/Field";
import { Callout, Skeleton, StatusPill } from "../../components/ui/feedback";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { Chart2Icon } from "../../components/ui/icons";
import { PageHeader } from "../../components/ui/layout";
import { PriorityLabel, ReportStatusPill } from "../../components/app/status";
import { OnboardingCard } from "../../features/dashboard/Onboarding";
import { baseOptions, ChartCanvas, useVizTheme } from "../../features/dashboard/chart";
import { bucketLabel, delta, formatMs, formatNumber } from "../../features/dashboard/format";

/**
 * The dashboard answers three questions and stops: are reports coming in,
 * are they reaching the team's tools, and is anything broken. Everything
 * else lives where the work is done — the inbox, the project, the
 * integration — so there is nothing here to arrange.
 */

const ranges: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

const rangeWords: Record<AnalyticsRange, string> = {
  "24h": "the 24 hours before",
  "7d": "the week before",
  "30d": "the 30 days before",
  "90d": "the 90 days before",
  "12m": "the year before",
};

export default function DashboardPage() {
  const { dashboard: prefs, updateDashboard } = usePreferences();
  const projects = useProjects();
  const scope = prefs.project !== "all" && projects.data?.projects.some((p) => p.id === prefs.project) ? prefs.project : undefined;
  // A range saved before the dashboard was simplified may not be offered any more.
  const range = ranges.some((r) => r.value === prefs.range) ? prefs.range : "30d";
  const analytics = useAnalytics(range, scope);
  const recent = useReports({ project: scope, status: "all" });
  const destinations = useOrgDestinations();

  const shownDestinations = destinations.data?.destinations.filter((d) => !scope || d.projectId === scope);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Chart2Icon}
        title="Dashboard"
        actions={
          <>
            {(projects.data?.projects.length ?? 0) > 1 && (
              <Select
                small
                aria-label="Project"
                className="!w-auto max-w-[190px]"
                value={scope ?? "all"}
                onChange={(e) => updateDashboard({ project: e.target.value })}
                options={[{ value: "all", label: "All projects" }, ...(projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
              />
            )}
            <Segmented<AnalyticsRange> ariaLabel="Time range" value={range} onChange={(r) => updateDashboard({ range: r })} options={ranges} />
          </>
        }
      />

      <div className="page-body home">
        <OnboardingCard />

        {analytics.isError ? (
          <Callout tone="danger" action={<Button size="sm" onClick={() => analytics.refetch()}>Try again</Button>}>
            {describeError(analytics.error, "Couldn't load the dashboard.")}
          </Callout>
        ) : (
          <>
            <Numbers data={analytics.data} range={range} />

            <section className="home-panel">
              <header className="home-panel__head">
                <h2>Reports</h2>
                {analytics.data && <span className="home-panel__aside tabular">{formatNumber(analytics.data.totals.reports, "full")} in this period</span>}
              </header>
              {analytics.data ? <Volume data={analytics.data} /> : <Skeleton h={200} />}
            </section>

            <div className="home-pair">
              <section className="home-panel">
                <header className="home-panel__head">
                  <h2>Latest reports</h2>
                  <Link to="/inbox" className="home-panel__link">
                    Inbox
                  </Link>
                </header>
                <Latest reports={recent.data?.pages[0]?.reports.slice(0, 6)} pending={recent.isPending} />
              </section>
              <section className="home-panel">
                <header className="home-panel__head">
                  <h2>Destinations</h2>
                  <Link to="/integrations" className="home-panel__link">
                    Integrations
                  </Link>
                </header>
                <Destinations list={shownDestinations} pending={destinations.isPending} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ numbers */

function Numbers({ data, range }: { data: Analytics | undefined; range: AnalyticsRange }) {
  if (!data) {
    return (
      <div className="home-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="home-stat">
            <Skeleton h={12} w={70} />
            <Skeleton h={26} w={60} className="mt-2" />
          </div>
        ))}
      </div>
    );
  }
  const t = data.totals;
  const change = delta(t.reports, t.previousReports);
  const finished = t.delivered + t.failed;
  const rate = finished ? (t.delivered / finished) * 100 : null;
  return (
    <div className="home-stats">
      <Stat
        label="Reports"
        value={formatNumber(t.reports, "compact")}
        note={change === null ? "Nothing to compare with" : `${change >= 0 ? "+" : "−"}${Math.abs(change)}% on ${rangeWords[range]}`}
      />
      <Stat label="Open" value={formatNumber(t.open, "compact")} note="New or investigating" />
      <Stat
        label="Delivered"
        value={rate === null ? "–" : `${rate.toFixed(rate === 100 || rate < 10 ? 0 : 1)}%`}
        note={finished ? `${formatNumber(t.delivered, "compact")} sent${t.p50DeliveryMs !== null ? `, usually in ${formatMs(t.p50DeliveryMs)}` : ""}` : "Nothing sent yet"}
        tone={rate !== null && rate < 95 ? "bad" : undefined}
      />
      <Stat
        label="Failing"
        value={String(t.failingDestinations)}
        note={t.failingDestinations ? (t.failingDestinations === 1 ? "destination needs a look" : "destinations need a look") : "Every destination is healthy"}
        tone={t.failingDestinations ? "bad" : "good"}
      />
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" }) {
  return (
    <div className="home-stat">
      <div className="home-stat__label">{label}</div>
      <div className="home-stat__value tabular" data-tone={tone}>
        {value}
      </div>
      <div className="home-stat__note">{note}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ chart */

/** One series, one colour. Priority and the rest are a click away in the inbox. */
function Volume({ data }: { data: Analytics }) {
  const theme = useVizTheme();
  const animate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const config = useMemo((): ChartConfiguration<"bar"> => {
    const labels = data.series.map((s) => bucketLabel(s.bucket, data.unit));
    const values = data.series.map((s) => s.low + s.medium + s.high + s.critical);
    const base = baseOptions(theme, { grid: true, animations: animate, legend: false });
    return {
      type: "bar",
      data: { labels, datasets: [{ label: "Reports", data: values, backgroundColor: theme.series[0], borderRadius: 3, borderSkipped: "start", maxBarThickness: 18, categoryPercentage: 0.75 }] },
      options: {
        ...base,
        plugins: {
          ...base.plugins,
          tooltip: {
            ...base.plugins.tooltip,
            displayColors: false,
            callbacks: {
              title: (items) => bucketLabel(data.series[items[0].dataIndex].bucket, data.unit, true),
              label: (item) => `${item.raw} ${item.raw === 1 ? "report" : "reports"}`,
            },
          },
        },
      } as ChartConfiguration<"bar">["options"],
    };
  }, [data, theme, animate]);

  if (!data.totals.reports) return <div className="home-empty">No reports in this period.</div>;
  return <ChartCanvas config={config} height={200} label={`Reports over time: ${data.totals.reports} in total`} />;
}

/* ------------------------------------------------------------------ lists */

function Latest({ reports, pending }: { reports: ReportListItem[] | undefined; pending: boolean }) {
  if (pending) return <Skeleton h={180} />;
  if (!reports?.length) return <div className="home-empty">Nothing yet. New reports show up here as they arrive.</div>;
  return (
    <div className="home-list">
      {reports.map((r) => (
        <Link key={r.id} to={`/projects/${r.projectId}/reports/${r.id}`} className="home-row">
          <PriorityLabel priority={r.priority} showText={false} />
          <span className="flex-1 min-w-0 truncate">{r.title}</span>
          <ReportStatusPill status={r.status} />
          <span className="home-row__time">{relativeTime(r.createdAt, false)}</span>
        </Link>
      ))}
    </div>
  );
}

/** Broken ones first: that's the reason to look at this list at all. */
function Destinations({ list, pending }: { list: Destination[] | undefined; pending: boolean }) {
  if (pending) return <Skeleton h={180} />;
  if (!list?.length) {
    return (
      <div className="home-empty">
        Reports aren't going anywhere yet.{" "}
        <Link to="/integrations" className="underline underline-offset-2">
          Connect a tool
        </Link>
      </div>
    );
  }
  // Lower is worse, so the list reads from what needs a look down to what doesn't.
  const health = (d: Destination) =>
    d.connection?.status === "error" || d.stats.lastStatus === "failed" ? 0 : d.stats.lastStatus === "retrying" ? 1 : !d.enabled ? 2 : !d.stats.lastAt ? 3 : 4;
  const pill = [
    <StatusPill key="f" tone="danger" plain>Failing</StatusPill>,
    <StatusPill key="r" tone="warning" plain>Retrying</StatusPill>,
    <StatusPill key="p" plain>Paused</StatusPill>,
    <StatusPill key="n" plain>Ready</StatusPill>,
    <StatusPill key="h" tone="success" plain>Healthy</StatusPill>,
  ];
  const sorted = [...list].sort((a, b) => health(a) - health(b) || b.stats.delivered - a.stats.delivered).slice(0, 6);
  return (
    <div className="home-list">
      {sorted.map((d) => (
        <Link key={d.id} to={`/projects/${d.projectId}/integrations`} className="home-row">
          <span className="text-text-2 shrink-0">
            <BrandIcon provider={d.provider} size={14} />
          </span>
          <span className="flex-1 min-w-0 truncate">
            {d.name}
            <span className="text-text-3"> · {d.projectName}</span>
          </span>
          {pill[health(d)]}
          <span className="home-row__time">{d.stats.lastAt ? relativeTime(d.stats.lastAt, false) : "–"}</span>
        </Link>
      ))}
    </div>
  );
}
