import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { describeError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useConnections, useOrgDestinations, useProjects, useProviders } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Destination, ProviderCategory } from "../../lib/types";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { Button, IconButton } from "../../components/ui/Button";
import { Switch } from "../../components/ui/controls";
import { Dialog } from "../../components/ui/Dialog";
import { Input, Select } from "../../components/ui/Field";
import { Callout, EmptyState, SkeletonRows, StatusPill } from "../../components/ui/feedback";
import { AddIcon, MagnifierIcon, MenuDotsIcon, PlugCircleIcon, RestartIcon, Routing2Icon, SettingsIcon, TrashBin2Icon, TuningIcon } from "../../components/ui/icons";
import { Menu } from "../../components/ui/Menu";
import { PageHeader } from "../../components/ui/layout";
import { toast, toastError } from "../../components/ui/Toast";
import { useDestinationActions } from "../../features/integrations/actions";
import { AddDestination, type WizardStart } from "../../features/integrations/AddDestination";
import { categoryLabels } from "../../features/integrations/categories";
import { DeliveryLog } from "../../features/integrations/DeliveryLog";
import { DestinationSettings } from "../../features/integrations/DestinationSettings";
import { targetSummary } from "../../features/integrations/shared";
import { formatMs } from "../../features/dashboard/format";
import { ConnectionsList } from "../settings/Connections";

/** Integrations: what's connected, the full directory, and every delivery. */
export function IntegrationsLayout() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={PlugCircleIcon}
        title="Integrations"
        tabs={
          <nav className="tabs" aria-label="Sections">
            <NavLink to="/integrations" end className="tab">
              Overview
            </NavLink>
            <NavLink to="/integrations/directory" className="tab">
              Directory
            </NavLink>
            <NavLink to="/integrations/log" className="tab">
              Delivery log
            </NavLink>
          </nav>
        }
        actions={
          <Link to="/settings/delivery" className="btn btn--sm btn--quiet">
            <TuningIcon size={13} />
            Delivery defaults
          </Link>
        }
      />
      <Outlet />
    </div>
  );
}

/* ------------------------------------------------------------------ adding a destination from anywhere */

/** Picks a project when there's more than one, then runs the usual wizard. */
export function useAddDestination() {
  const projects = useProjects();
  const [picking, setPicking] = useState<WizardStart | null>(null);
  const [running, setRunning] = useState<{ projectId: string; start: WizardStart } | null>(null);
  const [projectId, setProjectId] = useState("");
  const list = projects.data?.projects ?? [];

  const open = (start: WizardStart = {}) => {
    if (list.length === 1) setRunning({ projectId: list[0].id, start });
    else {
      setProjectId(list[0]?.id ?? "");
      setPicking(start);
    }
  };

  const element = (
    <>
      {picking && (
        <Dialog
          open
          width="narrow"
          onClose={() => setPicking(null)}
          title="Which project?"
          description="Destinations belong to a project. Its reports are delivered there."
          footer={
            <>
              <span className="mr-auto" />
              <Button onClick={() => setPicking(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!projectId}
                onClick={() => {
                  setRunning({ projectId, start: picking });
                  setPicking(null);
                }}
              >
                Continue
              </Button>
            </>
          }
        >
          {list.length ? (
            <Select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={list.map((p) => ({ value: p.id, label: p.name }))} />
          ) : (
            <Callout tone="info" action={<Link to="/projects?new=1" className="btn btn--sm">New project</Link>}>
              Create a project first.
            </Callout>
          )}
        </Dialog>
      )}
      {running && <AddDestination projectId={running.projectId} start={running.start} onClose={() => setRunning(null)} />}
    </>
  );
  return { open, element };
}

/* ------------------------------------------------------------------ overview */

type Health = "all" | "attention" | "paused" | "healthy";

export function destinationHealth(d: Destination): { tone: "success" | "danger" | "warning" | "neutral"; label: string; detail: string } {
  if (!d.enabled) return { tone: "neutral", label: "Paused", detail: d.pausedReason ?? "Paused - new reports aren't sent here" };
  if (d.connection?.status === "error") return { tone: "danger", label: "Reconnect", detail: d.connection.lastError ?? "The account needs reconnecting" };
  if (d.stats.lastStatus === "failed") return { tone: "danger", label: "Failing", detail: d.stats.lastError ?? "The last delivery failed" };
  if (d.stats.lastStatus === "retrying") return { tone: "warning", label: "Retrying", detail: d.stats.lastError ?? "Retrying" };
  if (!d.stats.lastStatus) return { tone: "neutral", label: "Not tested", detail: "Nothing sent yet" };
  return { tone: "success", label: "Healthy", detail: `Last delivery ${relativeTime(d.stats.lastAt)}` };
}

export function DestinationsTable({ destinations, showProject = true, showProvider = true }: { destinations: Destination[]; showProject?: boolean; showProvider?: boolean }) {
  const providers = useProviders();
  const actions = useDestinationActions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Destination | null>(null);
  const name = (id: string) => providers.data?.providers.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <div className="list overflow-x-auto">
        <table className="dtable">
          <thead>
            <tr>
              <th>Destination</th>
              {showProject && <th>Project</th>}
              <th>Status</th>
              <th className="num">7 days</th>
              <th className="num">Avg time</th>
              <th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {destinations.map((d) => {
              const h = destinationHealth(d);
              return (
                <tr key={d.id} data-clickable onClick={() => setEditing(d)}>
                  <td>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BrandIcon provider={d.provider} size={15} framed />
                      <div className="min-w-0">
                        <div className="truncate font-medium max-w-[260px]">{d.name}</div>
                        <div className="truncate text-xs text-text-3 max-w-[260px]">{[showProvider ? name(d.provider) : null, targetSummary(d)].filter(Boolean).join(" · ")}</div>
                      </div>
                    </div>
                  </td>
                  {showProject && (
                    <td className="text-text-2 whitespace-nowrap">
                      <Link to={`/projects/${d.projectId}/integrations`} onClick={(e) => e.stopPropagation()} className="hover:underline underline-offset-2">
                        {d.projectName}
                      </Link>
                    </td>
                  )}
                  <td title={h.detail}>
                    <StatusPill tone={h.tone} plain>
                      {h.label}
                    </StatusPill>
                  </td>
                  <td className="num">
                    {d.stats.weekDelivered.toLocaleString("en-GB")}
                    {d.stats.weekFailed > 0 && <span className="text-danger"> · {d.stats.weekFailed} failed</span>}
                  </td>
                  <td className="num text-text-2">{formatMs(d.stats.avgMs)}</td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <Switch label={d.enabled ? `Pause ${d.name}` : `Resume ${d.name}`} checked={d.enabled} onChange={(v) => actions.setEnabled(d, v)} />
                      <Menu
                        trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`Actions for ${d.name}`} />}
                        items={[
                          { label: "Settings…", icon: SettingsIcon, onSelect: () => setEditing(d) },
                          { label: "Send test", icon: Routing2Icon, onSelect: () => actions.sendTest(d) },
                          ...(d.stats.failed ? [{ label: "Retry failed", icon: RestartIcon, onSelect: () => actions.retryFailed({ destination: d.id }, d.name) }] : []),
                          ...(showProvider ? [{ label: `About ${name(d.provider)}`, icon: PlugCircleIcon, onSelect: () => navigate(`/integrations/${d.provider}`) }] : []),
                          "separator" as const,
                          { label: "Remove…", icon: TrashBin2Icon, danger: true, onSelect: () => actions.remove(d) },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <DestinationSettings destination={destinations.find((x) => x.id === editing.id) ?? editing} onClose={() => setEditing(null)} />}
    </>
  );
}

export function IntegrationsOverview() {
  const destinations = useOrgDestinations();
  const projects = useProjects();
  const connections = useConnections();
  const add = useAddDestination();
  const [health, setHealth] = useState<Health>("all");
  const [project, setProject] = useState("");
  const [search, setSearch] = useState("");

  const all = destinations.data?.destinations ?? [];
  const shown = all.filter((d) => {
    const h = destinationHealth(d);
    if (project && d.projectId !== project) return false;
    if (search && !`${d.name} ${d.provider} ${d.projectName} ${targetSummary(d) ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (health === "attention") return h.tone === "danger" || h.tone === "warning";
    if (health === "paused") return !d.enabled;
    if (health === "healthy") return h.tone === "success";
    return true;
  });
  const week = all.reduce((a, d) => ({ ok: a.ok + d.stats.weekDelivered, bad: a.bad + d.stats.weekFailed }), { ok: 0, bad: 0 });
  const timed = all.filter((d) => d.stats.avgMs !== null);
  const avg = timed.length ? timed.reduce((n, d) => n + (d.stats.avgMs ?? 0), 0) / timed.length : null;
  const attention = all.filter((d) => ["danger", "warning"].includes(destinationHealth(d).tone)).length;

  return (
    <div className="page-body flex flex-col gap-6 max-w-[1180px]">
      <div className="stat-strip">
        <div>
          <div className="stat-strip__label">Active destinations</div>
          <div className="stat-strip__value tabular">{all.filter((d) => d.enabled).length}</div>
        </div>
        <div>
          <div className="stat-strip__label">Delivered, 7 days</div>
          <div className="stat-strip__value tabular">{week.ok.toLocaleString("en-GB")}</div>
        </div>
        <div>
          <div className="stat-strip__label">Failed, 7 days</div>
          <div className={`stat-strip__value tabular ${week.bad ? "text-danger" : ""}`}>{week.bad.toLocaleString("en-GB")}</div>
        </div>
        <div>
          <div className="stat-strip__label">Average delivery time</div>
          <div className="stat-strip__value tabular">{formatMs(avg)}</div>
        </div>
        <div>
          <div className="stat-strip__label">Connected accounts</div>
          <div className="stat-strip__value tabular">{connections.data?.connections.length ?? "-"}</div>
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="set-group__title !m-0 mr-auto">Destinations</h2>
          <Input size_="sm" type="search" aria-label="Search destinations" placeholder="Search" className="!w-[170px]" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select
            small
            aria-label="Project"
            className="!w-auto"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            options={[{ value: "", label: "All projects" }, ...(projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Select
            small
            aria-label="Health"
            className="!w-auto"
            value={health}
            onChange={(e) => setHealth(e.target.value as Health)}
            options={[
              { value: "all", label: "Any state" },
              { value: "attention", label: `Needs attention${attention ? ` (${attention})` : ""}` },
              { value: "paused", label: "Paused" },
              { value: "healthy", label: "Healthy" },
            ]}
          />
          <Button size="sm" variant="primary" icon={AddIcon} onClick={() => add.open()}>
            Add destination
          </Button>
        </div>
        {destinations.isPending ? (
          <SkeletonRows rows={3} />
        ) : destinations.isError ? (
          <Callout tone="danger" action={<Button size="sm" onClick={() => destinations.refetch()}>Try again</Button>}>
            {describeError(destinations.error, "Couldn't load destinations.")}
          </Callout>
        ) : !all.length ? (
          <div className="list">
            <EmptyState
              icon={PlugCircleIcon}
              title="No destinations yet"
              action={
                <>
                  <Button variant="primary" icon={AddIcon} onClick={() => add.open()}>
                    Add destination
                  </Button>
                  <Link to="/integrations/directory" className="btn">
                    Browse integrations
                  </Link>
                </>
              }
            >
              Send reports to GitHub, Jira, Slack, Teams, Zendesk, PagerDuty and more than 120 other services, or your own webhook.
            </EmptyState>
          </div>
        ) : !shown.length ? (
          <p className="text-sm text-text-3 py-3">No destinations match.</p>
        ) : (
          <DestinationsTable destinations={shown} />
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="set-group__title !m-0">Connected accounts</h2>
          <Link to="/integrations/directory" className="text-xs text-text-3 hover:text-text">
            Connect another
          </Link>
        </div>
        <ConnectionsList />
      </section>
      {add.element}
    </div>
  );
}

/* ------------------------------------------------------------------ directory */

export function IntegrationsDirectory() {
  const providers = useProviders();
  const connections = useConnections();
  const destinations = useOrgDestinations();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const category = (params.get("category") ?? "") as ProviderCategory | "";
  const [connectedOnly, setConnectedOnly] = useState(false);

  const used = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of connections.data?.connections ?? []) m.set(c.provider, (m.get(c.provider) ?? 0) + 1);
    for (const d of destinations.data?.destinations ?? []) if (d.provider === "webhook") m.set("webhook", (m.get("webhook") ?? 0) + 1);
    return m;
  }, [connections.data, destinations.data]);

  const all = providers.data?.providers ?? [];
  const needle = search.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (!category || p.category === category) &&
      (!connectedOnly || used.has(p.id)) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.keywords.some((k) => k.includes(needle)) || p.summary.toLowerCase().includes(needle)),
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [all]);
  const setCategory = (c: string) => setParams(c ? { category: c } : {}, { replace: true });

  return (
    <div className="page-body flex flex-col gap-4 max-w-[1180px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <MagnifierIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
          <Input type="search" aria-label="Search integrations" placeholder={`Search ${all.length || 130} integrations`} className="!w-[280px] !pl-8" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <label className="checkbox ml-1">
          <input type="checkbox" checked={connectedOnly} onChange={(e) => setConnectedOnly(e.target.checked)} />
          <span>Connected only</span>
        </label>
        <span className="ml-auto text-xs text-text-3 tabular">{shown.length} shown</span>
      </div>
      <div className="chip-row" role="group" aria-label="Category">
        <button type="button" className="chip-toggle" aria-pressed={!category} onClick={() => setCategory("")}>
          All
        </button>
        {(Object.keys(categoryLabels) as ProviderCategory[])
          .filter((c) => counts.get(c))
          .map((c) => (
            <button key={c} type="button" className="chip-toggle" aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>
              {categoryLabels[c].plural} <span className="text-text-3 tabular">{counts.get(c)}</span>
            </button>
          ))}
      </div>
      {providers.isPending ? (
        <SkeletonRows rows={4} />
      ) : !shown.length ? (
        <p className="text-sm text-text-3 py-6">Nothing matches "{search}". Your own webhook can reach almost anything.</p>
      ) : (
        <div className="provider-grid">
          {shown.map((p) => (
            <Link key={p.id} to={`/integrations/${p.id}`} className="provider-card">
              <BrandIcon provider={p.id} size={18} framed />
              <div className="min-w-0">
                <div className="provider-card__name">
                  <span className="truncate">{p.name}</span>
                  {used.has(p.id) && (
                    <StatusPill tone="success" plain>
                      {used.get(p.id)}
                    </StatusPill>
                  )}
                </div>
                <div className="provider-card__summary">{p.summary}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ log */

export function IntegrationsLog() {
  const destinations = useOrgDestinations();
  const projects = useProjects();
  const providers = useProviders();
  const usedProviders = [...new Set((destinations.data?.destinations ?? []).map((d) => d.provider))];
  const name = (id: string) => providers.data?.providers.find((p) => p.id === id)?.name ?? id;
  return (
    <div className="page-body max-w-[1180px]">
      <DeliveryLog
        title={null}
        limit={100}
        projects={(projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
        providers={usedProviders.map((id) => ({ value: id, label: name(id) }))}
        destinations={(destinations.data?.destinations ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.projectName})` }))}
      />
    </div>
  );
}

/** Coming back from an OAuth sign-in started on an integrations page. */
export function useOAuthReturn(onConnected?: (provider: string | undefined, connectionId: string) => void) {
  const [params, setParams] = useSearchParams();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("connectError");
    if (!connected && !error) return;
    qc.invalidateQueries({ queryKey: ["org", orgId, "connections"] });
    if (connected) {
      toast("Account connected");
      onConnected?.(params.get("provider") ?? undefined, connected);
    } else toastError(error ?? "Couldn't connect the account.");
    setParams({}, { replace: true });
  }, [params, setParams, qc, orgId, onConnected]);
}
