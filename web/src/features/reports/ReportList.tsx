import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMembers, useProjects, useReports, type ReportFilters } from "../../lib/queries";
import { api, describeError } from "../../lib/api";
import { plural, relativeTime } from "../../lib/format";
import { useOrg } from "../../lib/session";
import type { Priority, ReportListItem, ReportStatus } from "../../lib/types";
import { Input, Select } from "../../components/ui/Field";
import { Button } from "../../components/ui/Button";
import { confirm } from "../../components/ui/Dialog";
import { toast, toastError } from "../../components/ui/Toast";
import { Callout, EmptyState, SkeletonRows, StatusPill } from "../../components/ui/feedback";
import { ChatRoundLineIcon, InboxIcon, MagnifierIcon, PaperclipIcon, UserCircleIcon, UsersGroupRoundedIcon } from "../../components/ui/icons";
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
  const { orgId, path, me } = useOrg();
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [delivery, setDelivery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const filters: ReportFilters = { project: project ?? projectFilter, status, priority: priority as ReportFilters["priority"], q, delivery, assignee };
  const reports = useReports(filters);
  const projects = useProjects();
  const members = useMembers();
  const rows = reports.data?.pages.flatMap((p) => p.reports) ?? [];
  const filtered = status !== "open" || priority || projectFilter || delivery || assignee || q;
  const listRef = useRef<HTMLDivElement>(null);
  const lastPicked = useRef<string | null>(null);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["org", orgId, "reports"] });
    qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
  }, [qc, orgId]);

  /** Applies the same change to each chosen report, a few at a time. */
  const applyToPicked = async (patch: { status?: ReportStatus; priority?: Priority; assigneeId?: string | null }, what: string) => {
    const ids = [...picked];
    setWorking(true);
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i += 4) {
        const batch = ids.slice(i, i + 4);
        const results = await Promise.allSettled(batch.map((id) => api(path(`/reports/${id}`), { method: "PATCH", body: patch })));
        failed += results.filter((r) => r.status === "rejected").length;
      }
      refresh();
      setPicked([]);
      toast(failed ? `${what} ${ids.length - failed} of ${ids.length}; ${failed} didn't work` : `${what} ${plural(ids.length, "report")}`);
    } finally {
      setWorking(false);
    }
  };

  const deletePicked = async () => {
    const ids = [...picked];
    if (!(await confirm({ title: `Delete ${plural(ids.length, "report")}?`, message: "Their attachments go too. Issues already created elsewhere stay where they are.", confirmLabel: "Delete", danger: true }))) return;
    setWorking(true);
    try {
      for (let i = 0; i < ids.length; i += 4) {
        await Promise.allSettled(ids.slice(i, i + 4).map((id) => api(path(`/reports/${id}`), { method: "DELETE" })));
      }
      refresh();
      setPicked([]);
      toast(`Deleted ${plural(ids.length, "report")}`);
    } finally {
      setWorking(false);
    }
  };

  /** One report, straight from the list. */
  const quickPatch = async (id: string, patch: { status?: ReportStatus; assigneeId?: string | null }, said: string) => {
    try {
      await api(path(`/reports/${id}`), { method: "PATCH", body: patch });
      refresh();
      toast(said);
    } catch (err) {
      toastError(describeError(err, "Couldn't change that report."));
    }
  };

  const focusRow = (delta: number) => {
    const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a.list-row") ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    // Nothing focused yet: start at the top going down, the bottom going up.
    const next = i === -1 ? links[delta > 0 ? 0 : links.length - 1] : links[Math.min(Math.max(i + delta, 0), links.length - 1)];
    next?.focus();
    return !!next;
  };

  /** The id of the row the keyboard is on. */
  const focusedId = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("a.list-row")?.dataset.report ?? null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const id = focusedId();
    switch (e.key) {
      case "ArrowDown":
      case "j":
        if (focusRow(1)) e.preventDefault();
        return;
      case "ArrowUp":
      case "k":
        if (focusRow(-1)) e.preventDefault();
        return;
      case "e":
        if (id) {
          e.preventDefault();
          void quickPatch(id, { status: "resolved" }, "Marked as resolved");
        }
        return;
      case "m":
        if (id) {
          e.preventDefault();
          void quickPatch(id, { assigneeId: me.user.id }, "Assigned to you");
        }
        return;
      case "x":
        if (id) {
          e.preventDefault();
          setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
          lastPicked.current = id;
        }
        return;
    }
  };

  /** Shift-click picks everything between this row and the last one picked. */
  const pick = (id: string, on: boolean, range: boolean) => {
    if (range && lastPicked.current) {
      const from = rows.findIndex((r) => r.id === lastPicked.current);
      const to = rows.findIndex((r) => r.id === id);
      if (from !== -1 && to !== -1) {
        const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((r) => r.id);
        setPicked((p) => [...new Set(on ? [...p, ...span] : p.filter((x) => !span.includes(x)))]);
        lastPicked.current = id;
        return;
      }
    }
    setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));
    lastPicked.current = id;
  };

  const assigneeOptions = useMemo(
    () => [
      { value: "", label: "Anyone" },
      { value: "me", label: "Assigned to me" },
      { value: "none", label: "Unassigned" },
      ...(members.data?.members ?? []).filter((m) => m.id !== me.user.id).map((m) => ({ value: m.id, label: m.name || m.email })),
    ],
    [members.data, me.user.id],
  );

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
        <Select aria-label="Assignee" className="!w-auto max-w-[180px]" value={assignee} onChange={(e) => setAssignee(e.target.value)} options={assigneeOptions} />
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
          {picked.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-surface-2 sticky top-0 z-[2]" role="region" aria-label="Chosen reports">
              <span className="text-sm font-medium">{plural(picked.length, "report")} chosen</span>
              <span className="flex-1" />
              <Button size="sm" busy={working} onClick={() => void applyToPicked({ status: "resolved" }, "Resolved")}>
                Resolve
              </Button>
              <Button size="sm" busy={working} onClick={() => void applyToPicked({ status: "closed" }, "Closed")}>
                Close
              </Button>
              <Button size="sm" busy={working} onClick={() => void applyToPicked({ assigneeId: me.user.id }, "Assigned to you:")}>
                Assign to me
              </Button>
              <Button size="sm" variant="danger" busy={working} onClick={deletePicked}>
                Delete…
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setPicked([])}>
                Clear
              </Button>
            </div>
          )}
          <div className="list" ref={listRef} onKeyDown={onKeyDown} aria-busy={reports.isFetching && !reports.isFetchingNextPage}>
            {rows.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                to={`${basePath}/${r.id}`}
                current={r.id === reportId}
                showProject={!project}
                picked={picked.includes(r.id)}
                onPick={(on, range) => pick(r.id, on, range)}
                choosing={picked.length > 0}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-text-3 px-1">
            <span>
              Showing {plural(rows.length, "report")}
              <span className="hidden md:inline"> · j and k move, e resolves, m assigns to you, x chooses</span>
            </span>
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

function ReportRow({
  report: r,
  to,
  current,
  showProject,
  picked,
  onPick,
  choosing,
}: {
  report: ReportListItem;
  to: string;
  current: boolean;
  showProject: boolean;
  picked: boolean;
  onPick: (on: boolean, range: boolean) => void;
  choosing: boolean;
}) {
  const meta = [showProject && r.projectName, `#${r.number}`, sourceLabel(r.source), r.environment, r.reporterEmail].filter(Boolean);
  return (
    <Link to={to} className="list-row" aria-current={current || undefined} data-report={r.id}>
      {/* Shown once something is chosen, or on hover, so the list stays quiet. */}
      <span className={`shrink-0 ${choosing || picked ? "" : "opacity-0 focus-within:opacity-100 hover:opacity-100 transition-opacity"}`}>
        <input
          type="checkbox"
          checked={picked}
          aria-label={`Choose report #${r.number}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onPick(!picked, e.shiftKey);
          }}
          onChange={() => {}}
        />
      </span>
      <PriorityLabel priority={r.priority} showText={false} />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{r.title}</div>
        <div className="truncate text-xs text-text-3">{meta.join(" · ")}</div>
      </div>
      <div className="hidden sm:flex items-center gap-3 shrink-0">
        {r.assigneeName && (
          <span className="inline-flex items-center gap-1 text-xs text-text-3" title={`Assigned to ${r.assigneeName}`}>
            <UserCircleIcon size={13} />
            {r.assigneeName.split(" ")[0]}
          </span>
        )}
        {r.noteCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-text-3" title={plural(r.noteCount, "note")}>
            <ChatRoundLineIcon size={13} />
            {r.noteCount}
          </span>
        )}
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
