import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { fullDate, relativeTime } from "../../lib/format";
import { useDelivery, useDeliveries } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { DeliveryRow } from "../../lib/types";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { Button, IconButton } from "../../components/ui/Button";
import { CopyButton } from "../../components/ui/Copy";
import { Input, Select } from "../../components/ui/Field";
import { Callout, Skeleton, SkeletonRows } from "../../components/ui/feedback";
import { RestartIcon, SquareArrowRightUpIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { Sheet } from "../../components/ui/Sheet";
import { toast, toastError } from "../../components/ui/Toast";
import { DeliveryPill } from "../../components/app/status";
import { formatMs } from "../dashboard/format";
import { useDestinationActions } from "./actions";

type Option = { value: string; label: string };

/** The delivery log with its filters. Fixed filters scope it to a project, destination or service. */
export function DeliveryLog({
  scope = {},
  destinations,
  projects,
  providers,
  title = "Delivery log",
  limit = 50,
}: {
  scope?: { project?: string; destination?: string; provider?: string };
  destinations?: Option[];
  projects?: Option[];
  providers?: Option[];
  title?: string | null;
  limit?: number;
}) {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const actions = useDestinationActions();
  const [status, setStatus] = useState("");
  const [destination, setDestination] = useState("");
  const [project, setProject] = useState("");
  const [provider, setProvider] = useState("");
  const [tests, setTests] = useState("include");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const filters = {
    project: scope.project ?? (project || undefined),
    destination: scope.destination ?? (destination || undefined),
    provider: scope.provider ?? (provider || undefined),
    status: status || undefined,
    q: q || undefined,
    tests,
    limit: String(limit),
  };
  const log = useDeliveries(filters);

  const retry = async (id: string) => {
    try {
      await api(path(`/deliveries/${id}/retry`), { body: {} });
      qc.invalidateQueries({ queryKey: ["org", orgId, "deliveries"] });
      toast("Queued another attempt");
    } catch (err) {
      toastError(describeError(err, "Couldn't retry the delivery."));
    }
  };

  const rows = log.data?.deliveries ?? [];
  const anyFilter = !!(status || destination || project || provider || q || tests !== "include");
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {title && <h2 className="set-group__title !m-0 mr-auto">{title}</h2>}
        {!title && <span className="mr-auto" />}
        <Input size_="sm" type="search" aria-label="Search deliveries" placeholder="Search reports or errors" className="!w-[200px]" value={search} onChange={(e) => setSearch(e.target.value)} />
        {projects && !scope.project && (
          <Select small aria-label="Project" className="!w-auto" value={project} onChange={(e) => setProject(e.target.value)} options={[{ value: "", label: "All projects" }, ...projects]} />
        )}
        {providers && !scope.provider && (
          <Select small aria-label="Integration" className="!w-auto max-w-[160px]" value={provider} onChange={(e) => setProvider(e.target.value)} options={[{ value: "", label: "All integrations" }, ...providers]} />
        )}
        {destinations && !scope.destination && destinations.length > 1 && (
          <Select small aria-label="Destination" className="!w-auto max-w-[180px]" value={destination} onChange={(e) => setDestination(e.target.value)} options={[{ value: "", label: "All destinations" }, ...destinations]} />
        )}
        <Select
          small
          aria-label="Status"
          className="!w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "", label: "Any status" },
            { value: "delivered", label: "Delivered" },
            { value: "retrying", label: "Retrying" },
            { value: "failed", label: "Failed" },
            { value: "pending", label: "Queued" },
          ]}
        />
        <Select
          small
          aria-label="Tests"
          className="!w-auto"
          value={tests}
          onChange={(e) => setTests(e.target.value)}
          options={[
            { value: "include", label: "With tests" },
            { value: "exclude", label: "No tests" },
            { value: "only", label: "Tests only" },
          ]}
        />
        {status === "failed" && rows.length > 0 && (
          <Button size="sm" icon={RestartIcon} onClick={() => actions.retryFailed({ project: filters.project, destination: filters.destination, provider: filters.provider }, "these destinations")}>
            Retry all failed
          </Button>
        )}
      </div>
      {log.isPending ? (
        <SkeletonRows rows={4} />
      ) : log.isError ? (
        <Callout tone="danger" action={<Button size="sm" onClick={() => log.refetch()}>Try again</Button>}>
          {describeError(log.error, "Couldn't load the delivery log.")}
        </Callout>
      ) : !rows.length ? (
        <p className="text-sm text-text-3 px-0.5 py-3">{anyFilter ? "No deliveries match." : "Nothing has been sent yet. Deliveries appear here as reports arrive."}</p>
      ) : (
        <div className="list">
          {rows.map((d) => (
            <DeliveryLine key={d.id} d={d} onOpen={() => setOpen(d.id)} onRetry={() => retry(d.id)} />
          ))}
        </div>
      )}
      {rows.length >= limit && <p className="hint mt-2">Showing the latest {limit}. Narrow the filters to see older ones.</p>}
      {open && <DeliveryDetailSheet id={open} onClose={() => setOpen(null)} onRetry={retry} />}
    </section>
  );
}

function DeliveryLine({ d, onOpen, onRetry }: { d: DeliveryRow; onOpen: () => void; onRetry: () => void }) {
  return (
    <div className="list-row list-row--interactive items-start cursor-default" onClick={onOpen}>
      <span className="mt-0.5 text-text-3">
        <BrandIcon provider={d.provider} size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <button type="button" className="truncate text-left hover:underline underline-offset-2" onClick={onOpen}>
            {d.reportTitle ?? (d.isTest ? "Test report" : "Deleted report")}
          </button>
          {d.event !== "report.created" && <span className="chip mono">{d.event.replace("report.", "")}</span>}
          {d.isTest && <span className="chip">Test</span>}
        </div>
        <div className="text-xs text-text-3 truncate">
          {d.destinationName} · {relativeTime(d.createdAt)}
          {d.status === "retrying" && ` · next attempt ${relativeTime(d.nextAttemptAt)}`}
          {d.attempts > 1 && ` · ${d.attempts} of ${d.maxAttempts} attempts`}
          {d.responseStatus ? ` · HTTP ${d.responseStatus}` : ""}
          {d.durationMs !== null && d.status === "delivered" ? ` · ${formatMs(d.durationMs)}` : ""}
        </div>
        {d.lastError && d.status !== "delivered" && <div className="text-xs text-text-2 mt-0.5">{d.lastError}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <DeliveryPill status={d.status} plain />
        {d.externalUrl && (
          <a href={d.externalUrl} target="_blank" rel="noopener noreferrer" className="btn btn--sm btn--quiet" aria-label={`Open ${d.externalId ?? "in destination"}`}>
            {d.externalId}
            <SquareArrowRightUpIcon size={12} />
          </a>
        )}
        {(d.status === "failed" || d.status === "retrying") && !d.isTest && <IconButton size="sm" icon={RestartIcon} label="Retry now" onClick={onRetry} />}
      </div>
    </div>
  );
}

function DeliveryDetailSheet({ id, onClose, onRetry }: { id: string; onClose: () => void; onRetry: (id: string) => void }) {
  const q = useDelivery(id);
  const d = q.data?.delivery;
  const body = d?.payload ? JSON.stringify(d.payload, null, 2) : null;
  return (
    <Sheet
      icon={d ? <BrandIcon provider={d.provider} size={18} framed /> : undefined}
      title={d ? (d.reportTitle ?? (d.isTest ? "Test report" : "Deleted report")) : "Delivery"}
      subtitle={d ? `${d.destinationName} · ${d.event}` : undefined}
      onClose={onClose}
      footer={
        d && (
          <>
            {d.reportId && (
              <Link to={`/projects/${d.projectId}/reports/${d.reportId}`} className="btn btn--quiet" onClick={onClose}>
                Open report
              </Link>
            )}
            <span className="mr-auto" />
            {(d.status === "failed" || d.status === "retrying") && !d.isTest && (
              <Button icon={RestartIcon} onClick={() => onRetry(d.id)}>
                Retry now
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      {q.isPending ? (
        <Skeleton h={200} />
      ) : !d ? (
        <Callout tone="danger">{describeError(q.error, "Couldn't load the delivery.")}</Callout>
      ) : (
        <>
          <SetGroup>
            <SetRow label="Status" hint={d.lastError ?? undefined}>
              <DeliveryPill status={d.status} />
            </SetRow>
            <SetRow label="Attempts" hint={d.status === "retrying" ? `Next attempt ${relativeTime(d.nextAttemptAt)} (${fullDate(d.nextAttemptAt)})` : undefined}>
              <span className="text-sm tabular">
                {d.attempts} of {d.maxAttempts}
              </span>
            </SetRow>
            {d.responseStatus !== null && (
              <SetRow label="Last response">
                <span className="mono text-sm">HTTP {d.responseStatus}</span>
              </SetRow>
            )}
            {d.durationMs !== null && (
              <SetRow label="Took">
                <span className="text-sm tabular">{formatMs(d.durationMs)}</span>
              </SetRow>
            )}
            {d.externalUrl && (
              <SetRow label="Created" hint={d.externalId ?? undefined}>
                <a href={d.externalUrl} target="_blank" rel="noopener noreferrer" className="btn btn--sm">
                  Open
                  <SquareArrowRightUpIcon size={12} />
                </a>
              </SetRow>
            )}
            <SetRow label="Queued" hint={fullDate(d.createdAt)}>
              <span className="text-sm text-text-2">{relativeTime(d.createdAt)}</span>
            </SetRow>
            <SetRow label="Delivery id">
              <span className="mono text-xs text-text-2">{d.id}</span>
              <CopyButton text={d.id} what="delivery id" />
            </SetRow>
          </SetGroup>

          <section>
            <h3 className="set-group__title">Attempts</h3>
            {d.attemptLog.length ? (
              <ol className="timeline">
                {[...d.attemptLog].reverse().map((a, i) => (
                  <li key={i} data-ok={a.ok}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.ok ? "Delivered" : "Failed"}</span>
                      {a.status ? <span className="chip mono">HTTP {a.status}</span> : null}
                      <span className="text-xs text-text-3">
                        {fullDate(a.at)} · {formatMs(a.ms)}
                      </span>
                    </div>
                    {a.error && <div className="text-xs text-text-2 mt-0.5">{a.error}</div>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-text-3">No attempts recorded yet.</p>
            )}
          </section>

          {body && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="set-group__title !m-0">Request body</h3>
                <CopyButton text={body} what="request body" />
              </div>
              <pre className="json">{body}</pre>
              <p className="hint mt-1.5">Retries send exactly these bytes, signed afresh.</p>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}
