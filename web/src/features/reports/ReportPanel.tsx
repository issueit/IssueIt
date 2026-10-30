import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { bytes, fullDate, relativeTime } from "../../lib/format";
import { useReport } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Priority, ReportDetail, ReportStatus } from "../../lib/types";
import { Button, IconButton } from "../../components/ui/Button";
import { copyText } from "../../components/ui/Copy";
import { confirm, prompt } from "../../components/ui/Dialog";
import { Callout, Skeleton, StatusPill } from "../../components/ui/feedback";
import { Menu } from "../../components/ui/Menu";
import { toast, toastError } from "../../components/ui/Toast";
import { BrandIcon } from "../../components/ui/BrandIcon";
import {
  AltArrowDownIcon,
  CloseIcon,
  CopyIcon,
  DocumentTextIcon,
  DownloadMinimalisticIcon,
  LinkMinimalistic2Icon,
  MenuDotsIcon,
  RestartIcon,
  SquareArrowRightUpIcon,
  TrashBin2Icon,
  UsersGroupRoundedIcon,
} from "../../components/ui/icons";
import { Diagnostics } from "./Diagnostics";
import { DeliveryPill, PriorityLabel, priorityLabels, ReportStatusPill, sourceLabel, statusLabels } from "../../components/app/status";

const statuses: ReportStatus[] = ["new", "investigating", "resolved", "closed"];
const priorities: Priority[] = ["critical", "high", "medium", "low"];

/** Report details in a side panel. Status changes are optimistic with Undo. */
export function ReportPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const report = useReport(id);
  return (
    <aside className="panel" aria-label="Report details" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      {report.isPending ? (
        <PanelSkeleton onClose={onClose} />
      ) : report.isError ? (
        <div className="p-4 flex flex-col gap-3">
          <div className="flex justify-end">
            <IconButton icon={CloseIcon} label="Close" onClick={onClose} />
          </div>
          <Callout tone="danger" action={<Button size="sm" onClick={() => report.refetch()}>Try again</Button>}>
            {describeError(report.error, "Couldn't load this report.")}
          </Callout>
        </div>
      ) : (
        <ReportView data={report.data} onClose={onClose} />
      )}
    </aside>
  );
}

function PanelSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="p-4 flex flex-col gap-4" aria-busy="true">
      <div className="flex justify-between">
        <Skeleton w={90} h={20} />
        <IconButton icon={CloseIcon} label="Close" onClick={onClose} />
      </div>
      <Skeleton w="80%" h={18} />
      <div className="flex flex-col gap-2">
        <Skeleton w="95%" />
        <Skeleton w="88%" />
        <Skeleton w="60%" />
      </div>
      <div className="grid grid-cols-[110px_1fr] gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="contents">
            <Skeleton w={70} h={10} />
            <Skeleton w={`${40 + ((i * 13) % 40)}%`} h={10} />
          </span>
        ))}
      </div>
    </div>
  );
}

function ReportView({ data, onClose }: { data: ReportDetail; onClose: () => void }) {
  const { report: r, attachments, deliveries, group, duplicates, emails } = data;
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const route = useLocation();
  /** Opens another report in this same panel, in the inbox or a project's reports. */
  const openReport = (id: string) => navigate(route.pathname.replace(/\/rep_[a-z0-9]+$/, "") + `/${id}`);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org", orgId, "reports"] });
    qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
  };

  const joinGroup = async () => {
    const answer = await prompt({
      title: "Add to another report",
      message: "For the same bug described differently. This report stops being its own item, and its reporter hears when the other one is fixed.",
      label: "Report number",
      placeholder: "12",
      confirmLabel: "Add to report",
    });
    const into = Number(answer?.replace(/^#/, "").trim());
    if (!answer || !Number.isInteger(into) || into < 1) return;
    try {
      const out = await api<{ groupId: string }>(path(`/reports/${r.id}/group`), { body: { into } });
      refresh();
      toast(`Added to #${into}`);
      openReport(out.groupId);
    } catch (err) {
      toastError(describeError(err, "Couldn't add it to that report."));
    }
  };

  const separate = async () => {
    try {
      await api(path(`/reports/${r.id}/separate`), { body: {} });
      refresh();
      toast("Separated. It's being sent to your destinations now.");
    } catch (err) {
      toastError(describeError(err, "Couldn't separate the report."));
    }
  };
  const key = ["org", orgId, "reports", "detail", r.id];

  const update = async (patch: { status?: ReportStatus; priority?: Priority }, undoable = true) => {
    const previous = qc.getQueryData<ReportDetail>(key);
    qc.setQueryData<ReportDetail>(key, (d) => (d ? { ...d, report: { ...d.report, ...patch } } : d));
    try {
      await api(path(`/reports/${r.id}`), { method: "PATCH", body: patch });
      qc.invalidateQueries({ queryKey: ["org", orgId, "reports"] });
      qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
      if (undoable) {
        const before = patch.status ? { status: r.status } : { priority: r.priority };
        const text = patch.status ? `Marked as ${statusLabels[patch.status].toLowerCase()}` : `Set priority to ${priorityLabels[patch.priority!].toLowerCase()}`;
        toast(text, { label: "Undo", run: () => update(before, false) });
      }
    } catch (err) {
      qc.setQueryData(key, previous);
      toastError(describeError(err, "Couldn't update the report."), () => update(patch, undoable));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this report?",
      message: "The report and its attachments are removed from Issueit for good. Issues already created in other tools stay where they are.",
      confirmLabel: "Delete report",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(path(`/reports/${r.id}`), { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["org", orgId, "reports"] });
      qc.invalidateQueries({ queryKey: ["org", orgId, "projects"] });
      toast("Deleted the report");
      onClose();
    } catch (err) {
      toastError(describeError(err, "Couldn't delete the report."));
    }
  };

  const retry = async (deliveryId: string) => {
    try {
      await api(path(`/deliveries/${deliveryId}/retry`), { body: {} });
      qc.invalidateQueries({ queryKey: key });
      toast("Queued another attempt");
    } catch (err) {
      toastError(describeError(err, "Couldn't retry the delivery."));
    }
  };

  const ctx = r.context ?? {};
  const browser = [r.browser ?? ctx.browser, ctx.os, ctx.device].filter(Boolean).join(" · ");
  const rows: Array<[string, React.ReactNode]> = [
    ["Project", <button className="hover:underline underline-offset-2" onClick={() => navigate(`/projects/${r.project.id}`)}>{r.project.name}</button>],
    ["Source", sourceLabel(r.source)],
    ["Reporter", [r.reporterName, r.reporterEmail].filter(Boolean).join(" · ") || <span className="text-text-3">Anonymous</span>],
    [
      "Page",
      r.pageUrl ? (
        <a href={r.pageUrl} target="_blank" rel="noopener noreferrer nofollow" className="mono text-text underline-offset-2 hover:underline">
          {r.pageUrl}
        </a>
      ) : null,
    ],
    ["Environment", r.environment],
    ["Browser", browser || null],
    ["Viewport", ctx.viewport],
    ["Screen", ctx.screen],
    ["Language", ctx.language],
    ["Time zone", ctx.timezone],
    ["Referrer", ctx.referrer],
    ["Received", <span title={fullDate(r.createdAt)}>{fullDate(r.createdAt)}</span>],
  ];

  return (
    <>
      <div className="flex items-center gap-2 h-[var(--page-header-h)] px-3 border-b border-border-subtle shrink-0">
        <span className="text-xs text-text-3 mono">#{r.number}</span>
        <div className="ml-auto flex items-center gap-1">
          <Menu
            trigger={
              <button type="button" className="btn btn--sm btn--quiet" aria-label={`Status: ${statusLabels[r.status]}`}>
                <ReportStatusPill status={r.status} plain />
                <AltArrowDownIcon size={12} />
              </button>
            }
            items={statuses.map((s) => ({ label: statusLabels[s], checked: s === r.status, onSelect: () => s !== r.status && update({ status: s }) }))}
          />
          <Menu
            trigger={
              <button type="button" className="btn btn--sm btn--quiet" aria-label={`Priority: ${priorityLabels[r.priority]}`}>
                <PriorityLabel priority={r.priority} />
                <AltArrowDownIcon size={12} />
              </button>
            }
            items={priorities.map((p) => ({ label: priorityLabels[p], checked: p === r.priority, onSelect: () => p !== r.priority && update({ priority: p }) }))}
          />
          <Menu
            trigger={<IconButton icon={MenuDotsIcon} label="More actions" size="sm" />}
            items={[
              { label: "Copy link", icon: LinkMinimalistic2Icon, onSelect: () => copyText(`${location.origin}/inbox/${r.id}`, "link") },
              { label: "Copy report id", icon: CopyIcon, onSelect: () => copyText(r.id, "report id") },
              ...(group ? [{ label: "Separate from the group", onSelect: separate }] : [{ label: "Add to another report…", icon: UsersGroupRoundedIcon, onSelect: joinGroup }]),
              "separator",
              { label: "Delete report…", icon: TrashBin2Icon, danger: true, onSelect: remove },
            ]}
          />
          <IconButton icon={CloseIcon} label="Close" size="sm" onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
        {group && (
          <Callout
            tone="info"
            title={`Part of #${group.number}`}
            action={
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => openReport(group.id)}>
                  Open #{group.number}
                </Button>
                <Button size="sm" variant="quiet" onClick={separate}>
                  Separate
                </Button>
              </div>
            }
          >
            The same bug as “{group.title}”, reported {group.duplicateCount + 1} times. It wasn't sent to your destinations again. Its status follows #{group.number}.
          </Callout>
        )}
        <section>
          <h2 className="text-lg font-semibold leading-snug" style={{ overflowWrap: "anywhere" }}>
            {r.title}
          </h2>
          <div className="mt-2 text-sm text-text-2 whitespace-pre-wrap select-text" style={{ overflowWrap: "anywhere" }}>
            {r.description || <span className="text-text-3">No description.</span>}
          </div>
        </section>

        {attachments.length > 0 && (
          <section>
            <h3 className="section-title">Attachments</h3>
            <div className="flex flex-col gap-2">
              {attachments.map((a) => {
                const url = `/api${path(`/attachments/${a.id}`)}`;
                return a.contentType.startsWith("image/") ? (
                  <a key={a.id} href={url} target="_blank" rel="noopener" className="block rounded-md border border-border overflow-hidden bg-sunken hover:border-border-strong">
                    <img src={url} alt={a.filename} loading="lazy" className="block max-h-[280px] w-full object-contain" />
                    <span className="flex items-center justify-between px-2.5 py-1.5 text-xs text-text-3 border-t border-border">
                      <span className="truncate">{a.filename}</span>
                      <span className="tabular">{bytes(a.sizeBytes)}</span>
                    </span>
                  </a>
                ) : (
                  <div key={a.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 h-9 text-sm">
                    <DocumentTextIcon size={14} className="text-text-3" />
                    <span className="flex-1 truncate">{a.filename}</span>
                    <span className="text-xs text-text-3 tabular">{bytes(a.sizeBytes)}</span>
                    <a href={`${url}?download=1`} className="btn btn--sm btn--quiet btn--icon" aria-label={`Download ${a.filename}`}>
                      <DownloadMinimalisticIcon size={14} />
                    </a>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {duplicates.length > 0 && (
          <section>
            <h3 className="section-title">
              Reported {r.duplicateCount + 1} times{r.lastSeenAt ? `, last ${relativeTime(r.lastSeenAt)}` : ""}
            </h3>
            <div className="list">
              {duplicates.map((d) => (
                <button key={d.id} type="button" className="list-row text-left w-full" onClick={() => openReport(d.id)}>
                  <span className="text-xs text-text-3 mono w-9 shrink-0">#{d.number}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm">{[d.reporterName, d.reporterEmail].filter(Boolean).join(" · ") || "Anonymous"}</span>
                    <span className="block truncate text-xs text-text-3">{[d.title !== r.title && d.title, d.pageUrl, d.browser].filter(Boolean).join(" · ") || "Same title"}</span>
                  </span>
                  <time className="text-xs text-text-3 tabular shrink-0" dateTime={d.createdAt}>
                    {relativeTime(d.createdAt, false)}
                  </time>
                </button>
              ))}
            </div>
            {r.duplicateCount > duplicates.length && <p className="mt-1.5 text-xs text-text-3">Showing the latest {duplicates.length}.</p>}
          </section>
        )}

        <Diagnostics data={r.diagnostics ?? {}} />

        <section>
          <h3 className="section-title">Details</h3>
          <dl className="props">
            {rows
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
        </section>

        <section>
          <h3 className="section-title">Delivered to</h3>
          {deliveries.length === 0 ? (
            <p className="text-sm text-text-3">
              Nowhere yet.{" "}
              <button className="underline underline-offset-2 text-text-2 hover:text-text" onClick={() => navigate(`/projects/${r.project.id}/integrations`)}>
                Add a destination
              </button>{" "}
              to send new reports to GitHub, Linear, Slack and more.
            </p>
          ) : (
            <div className="list">
              {deliveries.map((d) => (
                <div key={d.id} className="list-row items-start">
                  <span className="mt-0.5 text-text-2">
                    <BrandIcon provider={d.provider} size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{d.destinationName}</span>
                      {d.event !== "report.created" && <span className="chip mono">{d.event.replace("report.", "")}</span>}
                    </div>
                    <div className="text-xs text-text-3">
                      {d.status === "delivered"
                        ? `Delivered ${relativeTime(d.deliveredAt)}`
                        : d.status === "retrying"
                          ? `Next attempt ${relativeTime(d.nextAttemptAt)} · attempt ${d.attempts}`
                          : d.status === "failed"
                            ? `Failed after ${d.attempts} ${d.attempts === 1 ? "attempt" : "attempts"}`
                            : "Waiting to send"}
                    </div>
                    {d.lastError && d.status !== "delivered" && <div className="mt-1 text-xs text-text-2">{d.lastError}</div>}
                    {d.externalState && d.externalState !== "open" && (
                      <div className="mt-1 text-xs text-text-2">{d.externalState === "resolved" ? "Issue closed as done. The report was resolved." : "Issue closed without a fix."}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <DeliveryPill status={d.status} plain />
                    {d.externalUrl && (
                      <a href={d.externalUrl} target="_blank" rel="noopener noreferrer" className="btn btn--sm btn--quiet" title="Open in the destination">
                        {d.externalId ?? "Open"}
                        <SquareArrowRightUpIcon size={12} />
                      </a>
                    )}
                    {(d.status === "failed" || d.status === "retrying") && <IconButton icon={RestartIcon} label="Retry now" size="sm" onClick={() => retry(d.id)} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {r.reporterEmail && (
          <section>
            <h3 className="section-title">Emails to the reporter</h3>
            {emails.length ? (
              <div className="list">
                {emails.map((m) => (
                  <div key={m.id} className="list-row items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{m.kind === "receipt" ? "Receipt" : "It's fixed"}</div>
                      <div className="text-xs text-text-3 truncate">
                        {m.to}
                        {m.status === "sent" && m.sentAt ? ` · ${relativeTime(m.sentAt)}` : ""}
                      </div>
                      {m.lastError && m.status !== "sent" && <div className="mt-1 text-xs text-text-2">{m.lastError}</div>}
                    </div>
                    <StatusPill plain tone={m.status === "sent" ? "success" : m.status === "failed" ? "danger" : m.status === "skipped" ? "neutral" : "warning"}>
                      {{ pending: "Waiting", sending: "Sending", sent: "Sent", failed: "Failed", skipped: "Not sent" }[m.status]}
                    </StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-3">
                {r.notifyReporter ? (
                  <>
                    Asked for updates.{" "}
                    <button className="underline underline-offset-2 text-text-2 hover:text-text" onClick={() => navigate(`/projects/${r.project.id}/settings`)}>
                      Turn on reporter emails
                    </button>{" "}
                    to tell them when it's fixed.
                  </>
                ) : (
                  "Didn't ask for updates."
                )}
              </p>
            )}
          </section>
        )}

        {Object.keys(r.metadata ?? {}).length > 0 && (
          <section>
            <h3 className="section-title">Metadata</h3>
            <div className="code-block">
              <pre>{JSON.stringify(r.metadata, null, 2)}</pre>
            </div>
          </section>
        )}

        {ctx.userAgent && (
          <section>
            <h3 className="section-title">User agent</h3>
            <p className="mono text-xs text-text-3 break-all">{ctx.userAgent}</p>
          </section>
        )}
      </div>
    </>
  );
}
