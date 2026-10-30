import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useConnections, useOrgDestinations, useProviders } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { Button } from "../../components/ui/Button";
import { Callout, EmptyState, Skeleton } from "../../components/ui/feedback";
import { AddIcon, AltArrowLeftIcon, PlugCircleIcon, RestartIcon, SquareArrowRightUpIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { toast } from "../../components/ui/Toast";
import { useDestinationActions } from "../../features/integrations/actions";
import { categoryLabels } from "../../features/integrations/categories";
import { DeliveryLog } from "../../features/integrations/DeliveryLog";
import { eventLabels, TokenConnectForm } from "../../features/integrations/shared";
import { formatMs } from "../../features/dashboard/format";
import { ConnectionsList } from "../settings/Connections";
import { DestinationsTable, useAddDestination, useOAuthReturn } from "./Integrations";

/** One service: its accounts, where it's used, what it can do, and its deliveries. */
export function IntegrationProvider() {
  const { provider: id = "" } = useParams();
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const providers = useProviders();
  const connections = useConnections();
  const destinations = useOrgDestinations();
  const actions = useDestinationActions();
  const add = useAddDestination();
  const [connecting, setConnecting] = useState(false);
  const [authorising, setAuthorising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = providers.data?.providers.find((x) => x.id === id);
  const accounts = (connections.data?.connections ?? []).filter((c) => c.provider === id);
  const used = (destinations.data?.destinations ?? []).filter((d) => d.provider === id);
  const week = used.reduce((a, d) => ({ ok: a.ok + d.stats.weekDelivered, bad: a.bad + d.stats.weekFailed }), { ok: 0, bad: 0 });
  const failed = used.reduce((n, d) => n + d.stats.failed, 0);
  const timed = used.filter((d) => d.stats.avgMs !== null);
  const avg = timed.length ? timed.reduce((n, d) => n + (d.stats.avgMs ?? 0), 0) / timed.length : null;

  // After signing in, offer to put the new account to work straight away.
  useOAuthReturn(
    useCallback(
      (provider: string | undefined, connectionId: string) => {
        if (provider === id) add.open({ provider: id, connectionId });
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [id],
    ),
  );

  const authorise = async () => {
    setAuthorising(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(path(`/connections/authorize/${id}`), { body: { returnTo: `/integrations/${id}` } });
      window.location.href = url;
    } catch (err) {
      setError(describeError(err, `Couldn't start connecting to ${p?.name}.`));
      setAuthorising(false);
    }
  };

  if (providers.isPending) return <div className="page-body"><Skeleton h={200} /></div>;
  if (!p)
    return (
      <div className="page-body">
        <div className="list">
          <EmptyState icon={PlugCircleIcon} title="Integration not found" action={<Link to="/integrations/directory" className="btn">Browse integrations</Link>}>
            There's no integration called "{id}".
          </EmptyState>
        </div>
      </div>
    );

  return (
    <div className="page-body flex flex-col gap-6 max-w-[1180px]">
      <div>
        <Link to="/integrations/directory" className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text mb-3">
          <AltArrowLeftIcon size={12} />
          All integrations
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <BrandIcon provider={p.id} size={30} framed />
          <div className="flex-1 min-w-[240px]">
            <h1 className="page-title">{p.name}</h1>
            <p className="text-sm text-text-2 mt-0.5 max-w-[620px]">{p.summary}</p>
            <p className="text-xs text-text-3 mt-1">
              {categoryLabels[p.category].one}
              {p.targetLabel ? ` · delivers to a ${p.targetLabel.toLowerCase()}` : ""}
              {p.kind === "tracker" ? " · creates one item per report" : p.kind === "chat" ? " · posts a message per event" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {failed > 0 && (
              <Button icon={RestartIcon} onClick={() => actions.retryFailed({ provider: p.id }, p.name)}>
                Retry {failed} failed
              </Button>
            )}
            <Button variant="primary" icon={AddIcon} onClick={() => add.open({ provider: p.id, connectionId: accounts.length === 1 ? accounts[0].id : undefined })}>
              Add to a project
            </Button>
          </div>
        </div>
      </div>

      {used.length > 0 && (
        <div className="stat-strip">
          <div>
            <div className="stat-strip__label">Destinations</div>
            <div className="stat-strip__value tabular">{used.length}</div>
          </div>
          <div>
            <div className="stat-strip__label">Delivered, 7 days</div>
            <div className="stat-strip__value tabular">{week.ok.toLocaleString("en-GB")}</div>
          </div>
          <div>
            <div className="stat-strip__label">Failed, 7 days</div>
            <div className={`stat-strip__value tabular ${week.bad ? "text-danger" : ""}`}>{week.bad}</div>
          </div>
          <div>
            <div className="stat-strip__label">Average delivery time</div>
            <div className="stat-strip__value tabular">{formatMs(avg)}</div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6 min-w-0">
          {p.needsConnection && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="set-group__title !m-0">Accounts</h2>
                {accounts.length > 0 && !connecting && (
                  <Button size="sm" icon={AddIcon} onClick={() => (p.oauth ? authorise() : setConnecting(true))} busy={authorising}>
                    Connect another
                  </Button>
                )}
              </div>
              {error && (
                <div className="mb-2">
                  <Callout tone="danger">{error}</Callout>
                </div>
              )}
              {accounts.length > 0 && <ConnectionsList provider={p.id} />}
              {(!accounts.length || connecting) && (
                <div className="set-group p-4 flex flex-col gap-3 mt-2">
                  <div className="text-sm font-medium">Connect {p.name}</div>
                  {p.oauth && (
                    <div>
                      <Button variant="primary" busy={authorising} onClick={authorise}>
                        Sign in with {p.name.replace(/ Issues$/, "")}
                      </Button>
                      {p.tokenFields.length > 0 && <p className="hint mt-2">Or use a token instead:</p>}
                    </div>
                  )}
                  {!p.oauth && p.oauthPossible && (
                    <p className="hint">Sign-in isn't set up on this server, so connect with a token. An administrator can enable sign-in by adding a client id and secret.</p>
                  )}
                  {p.tokenFields.length > 0 && (
                    <TokenConnectForm
                      provider={p}
                      onConnected={(c) => {
                        qc.invalidateQueries({ queryKey: ["org", orgId, "connections"] });
                        setConnecting(false);
                        toast(`Connected ${c.account.label}`, { label: "Add to a project", run: () => add.open({ provider: p.id, connectionId: c.id }) });
                      }}
                    />
                  )}
                  {connecting && (
                    <div>
                      <Button size="sm" variant="quiet" onClick={() => setConnecting(false)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <section>
            <h2 className="set-group__title">Where it's used</h2>
            {destinations.isPending ? (
              <Skeleton h={80} />
            ) : used.length ? (
              <DestinationsTable destinations={used} showProvider={false} />
            ) : (
              <div className="list">
                <EmptyState icon={PlugCircleIcon} title={`No project sends to ${p.name} yet`} action={<Button icon={AddIcon} onClick={() => add.open({ provider: p.id })}>Add to a project</Button>}>
                  Each project chooses its own destinations, with its own routing and retry settings.
                </EmptyState>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <SetGroup title="Capabilities">
            <SetRow label="Connects with" hint={p.oauth ? "Sign-in is ready on this server." : p.oauthPossible ? "Sign-in needs setting up by an administrator." : undefined}>
              <span className="text-xs text-text-2 text-right">{[p.oauthPossible && "Sign-in", p.tokenFields.length && "Token", !p.needsConnection && "URL"].filter(Boolean).join(", ")}</span>
            </SetRow>
            <SetRow label="Target">
              <span className="text-xs text-text-2">{p.targetLabel ?? (p.targetFields.length ? p.targetFields.map((f) => f.label).join(", ") : "The account itself")}</span>
            </SetRow>
            <div className="set-row">
              <div className="set-row__text">
                <div className="set-row__label">Acts on</div>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text-2">
                  {p.events.map((e) => (
                    <li key={e}>{eventLabels[e]}</li>
                  ))}
                </ul>
              </div>
            </div>
            <SetRow label="Retries and limits" hint="Per destination, on top of your defaults.">
              <Link to="/settings/delivery" className="btn btn--sm btn--quiet">
                Defaults
              </Link>
            </SetRow>
          </SetGroup>
          {p.tokenHelp && (
            <a href={p.tokenHelp.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text">
              {p.tokenHelp.text}
              <SquareArrowRightUpIcon size={12} />
            </a>
          )}
        </aside>
      </div>

      {used.length > 0 && <DeliveryLog scope={{ provider: p.id }} title={`Deliveries to ${p.name}`} destinations={used.map((d) => ({ value: d.id, label: `${d.name} (${d.projectName})` }))} limit={30} />}
      {add.element}
    </div>
  );
}
