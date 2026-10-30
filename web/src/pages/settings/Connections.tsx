import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { plural, relativeTime } from "../../lib/format";
import { useConnections, useProviders } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { Connection } from "../../lib/types";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { Button, IconButton } from "../../components/ui/Button";
import { confirm } from "../../components/ui/Dialog";
import { Callout, EmptyState, Skeleton, StatusPill } from "../../components/ui/feedback";
import { Menu } from "../../components/ui/Menu";
import { toast, toastError } from "../../components/ui/Toast";
import { MenuDotsIcon, PlugCircleIcon, RefreshIcon, SquareArrowRightUpIcon, TrashBin2Icon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";

/** Accounts are shared by every project in the organisation. One row per account. */
export function ConnectionsSettings() {
  return (
    <>
      <h2 className="page-title mb-1">Connected accounts</h2>
      <p className="text-sm text-text-3 mb-4">
        Accounts Issueit delivers reports with. Connect new ones from{" "}
        <Link to="/integrations/directory" className="underline underline-offset-2">
          Integrations
        </Link>
        .
      </p>
      <ConnectionsList />
    </>
  );
}

/** Connected accounts, optionally for one service only. */
export function ConnectionsList({ provider, empty }: { provider?: string; empty?: string }) {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const connections = useConnections();
  const providers = useProviders();
  const [checking, setChecking] = useState<string | null>(null);
  const name = (id: string) => providers.data?.providers.find((p) => p.id === id)?.name ?? id;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org", orgId, "connections"] });
    qc.invalidateQueries({ queryKey: ["org", orgId, "destinations"] });
  };

  const check = async (c: Connection) => {
    setChecking(c.id);
    try {
      await api(path(`/connections/${c.id}/validate`), { body: {} });
      toast(`${c.account.label} is working`);
    } catch (err) {
      toastError(describeError(err, `Couldn't check ${c.account.label}.`));
    } finally {
      setChecking(null);
      refresh();
    }
  };

  const remove = async (c: Connection) => {
    const used = c.destinationCount ?? 0;
    const ok = await confirm({
      title: `Disconnect ${c.account.label}?`,
      message: used
        ? `${plural(used, "destination")} use this account and will be removed with it. Issueit deletes the stored credentials; you can also revoke access in ${name(c.provider)}.`
        : `Issueit deletes the stored credentials. You can also revoke access in ${name(c.provider)}.`,
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(path(`/connections/${c.id}`), { method: "DELETE" });
      refresh();
      toast(`Disconnected ${c.account.label}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't disconnect the account."));
    }
  };

  const list = (connections.data?.connections ?? []).filter((c) => !provider || c.provider === provider);
  return (
    <>
      {connections.isPending ? (
        <Skeleton h={100} />
      ) : connections.isError ? (
        <Callout tone="danger" action={<Button size="sm" onClick={() => connections.refetch()}>Try again</Button>}>
          {describeError(connections.error, "Couldn't load connected accounts.")}
        </Callout>
      ) : !list.length ? (
        <div className="list">
          <EmptyState icon={PlugCircleIcon} title="No connected accounts">
            {empty ?? "When you connect GitHub, Linear or any other service, its account shows up here."}
          </EmptyState>
        </div>
      ) : (
        <SetGroup>
          {list.map((c) => (
            <SetRow
              key={c.id}
              id={c.id}
              label={
                <span className="inline-flex items-center gap-2">
                  <BrandIcon provider={c.provider} size={14} />
                  {c.account.label}
                </span>
              }
              hint={
                c.status === "error" ? (
                  <span className="text-danger">{c.lastError ?? "Needs reconnecting."}</span>
                ) : (
                  `${name(c.provider)} · ${c.authType === "oauth" ? "signed in" : "token"} · connected ${relativeTime(c.createdAt)} · ${plural(c.destinationCount ?? 0, "destination")}`
                )
              }
            >
              {c.status === "error" ? <StatusPill tone="danger" plain>Needs attention</StatusPill> : <StatusPill tone="success" plain>Connected</StatusPill>}
              <Menu
                trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`Actions for ${c.account.label}`} busy={checking === c.id} />}
                items={[
                  { label: "Check connection", icon: RefreshIcon, onSelect: () => check(c) },
                  ...(c.account.url ? [{ label: `Open in ${name(c.provider)}`, icon: SquareArrowRightUpIcon, onSelect: () => window.open(c.account.url, "_blank", "noopener") }] : []),
                  "separator" as const,
                  { label: "Disconnect…", icon: TrashBin2Icon, danger: true, onSelect: () => remove(c) },
                ]}
              />
            </SetRow>
          ))}
        </SetGroup>
      )}
    </>
  );
}
