import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useProjects, useReports, type ReportFilters } from "../../lib/queries";
import { describeError } from "../../lib/api";
import { plural, relativeTime } from "../../lib/format";
import type { ReportListItem } from "../../lib/types";
import { Input, Select } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { Callout, EmptyState, SkeletonRows, StatusPill } from "../../components/ui/feedback";
import { InboxIcon, MagnifierIcon, PaperclipIcon, UsersGroupRoundedIcon } from "../../components/ui/icons";
import { PriorityLabel, ReportStatusPill, sourceLabel } from "../../components/app/status";

const statusOptions = [
  { value: "open", label: "Open" },
  { value: "new", label: "New" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All statuses" },
];

const priorityOptions = [
  { value: "", label: "Any priority" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** The filterable report list shared by the inbox and a project's reports. */
export function ReportList({ project, basePath, empty }: { project?: string; basePath: string; empty?: React.ReactNode }) {
  const { reportId } = useParams();
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [delivery, setDelivery] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const filters: ReportFilters = { project: project ?? projectFilter, status, priority: priority as ReportFilters["priority"], q, delivery };
  const reports = useReports(filters);
  const projects = useProjects();
  const rows = reports.data?.pages.flatMap((p) => p.reports) ?? [];
  const filtered = status !== "open" || priority || projectFilter || delivery || q;
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a.list-row") ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    const next = links[e.key === "ArrowDown" ? Math.min(i + 1, links.length - 1) : Math.max(i - 1, 0)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <MagnifierIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none" />
          <Input type="search" placeholder="Search reports" aria-label="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 28 }} />
        </div>
        <Select aria-label="Status" options={statusOptions} value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto" />
        <Select aria-label="Priority" options={priorityOptions} value={priority} onChange={(e) => setPriority(e.target.value)} className="!w-auto" />
        {!project && (
          <Select
            aria-label="Project"
            className="!w-auto max-w-[200px]"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            options={[{ value: "", label: "All projects" }, ...(projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
        )}
        <Select
          aria-label="Delivery"
          className="!w-auto"
          value={delivery}
          onChange={(e) => setDelivery(e.target.value)}
          options={[
            { value: "", label: "Any delivery" },
            { value: "failed", label: "Delivery failed" },
          ]}
        />
      </div>

      {reports.isPending ? (
        <SkeletonRows rows={6} />
      ) : reports.isError ? (
        <Callout tone="danger" action={<Button size="sm" onClick={() => reports.refetch()}>Try again</Button>}>
          {describeError(reports.error, "Couldn't load reports.")}
        </Callout>
      ) : !rows.length ? (
        <div className="list">
          {filtered ? (
            <EmptyState icon={MagnifierIcon} title="No matching reports">
              Nothing matches these filters. Try a different status or search.
            </EmptyState>
          ) : (
            (empty ?? (
              <EmptyState icon={InboxIcon} title="No open reports">
                New reports from your widget, hosted forms and API land here.
              </EmptyState>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="list" ref={listRef} onKeyDown={onKeyDown} aria-busy={reports.isFetching && !reports.isFetchingNextPage}>
            {rows.map((r) => (
              <ReportRow key={r.id} report={r} to={`${basePath}/${r.id}`} current={r.id === reportId} showProject={!project} />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-text-3 px-1">
            <span>Showing {plural(rows.length, "report")}</span>
            {reports.hasNextPage && (
              <Button size="sm" busy={reports.isFetchingNextPage} onClick={() => reports.fetchNextPage()}>
                Load more
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ReportRow({ report: r, to, current, showProject }: { report: ReportListItem; to: string; current: boolean; showProject: boolean }) {
  const meta = [showProject && r.projectName, `#${r.number}`, sourceLabel(r.source), r.environment, r.reporterEmail].filter(Boolean);
  return (
    <Link to={to} className="list-row" aria-current={current || undefined}>
      <PriorityLabel priority={r.priority} showText={false} />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{r.title}</div>
        <div className="truncate text-xs text-text-3">{meta.join(" · ")}</div>
      </div>
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        {r.duplicateCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-text-2 tabular"
            title={`Reported ${r.duplicateCount + 1} times${r.lastSeenAt ? `, last ${new Date(r.lastSeenAt).toLocaleString("en-GB")}` : ""}`}
          >
            <UsersGroupRoundedIcon size={13} />
            {r.duplicateCount + 1}
          </span>
        )}
        {r.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-text-3" title={plural(r.attachmentCount, "attachment")}>
            <PaperclipIcon size={13} />
            {r.attachmentCount}
          </span>
        )}
        <DeliverySummary r={r} />
        <ReportStatusPill status={r.status} />
        <time className="w-14 text-right text-xs text-text-3 tabular" dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString("en-GB")}>
          {relativeTime(r.createdAt, false)}
        </time>
      </div>
    </Link>
  );
}

function DeliverySummary({ r }: { r: ReportListItem }) {
  if (r.failed)
    return (
      <StatusPill tone="danger" plain title="At least one destination failed">
        {r.failed} failed
      </StatusPill>
    );
  if (r.pending)
    return (
      <StatusPill tone="warning" plain>
        Sending
      </StatusPill>
    );
  if (r.delivered)
    return (
      <span className="text-xs text-text-3" title="Delivered to your destinations">
        Sent to {r.delivered}
      </span>
    );
  return null;
}
