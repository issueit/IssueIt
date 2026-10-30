import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { useDeliveryPolicy, useProviders } from "../../lib/queries";
import { merge, sparse } from "../../lib/policy";
import { useOrg } from "../../lib/session";
import type { DeliveryPolicy, Destination, RoutingRule, WebhookEvent } from "../../lib/types";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { Button, IconButton } from "../../components/ui/Button";
import { Switch } from "../../components/ui/controls";
import { SecretField } from "../../components/ui/Copy";
import { confirm } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Field";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { AddIcon, TrashBin2Icon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { Sheet } from "../../components/ui/Sheet";
import { toast, toastError } from "../../components/ui/Toast";
import { useDestinationActions } from "./actions";
import { PolicyEditor } from "./PolicyEditor";
import { EventFields, RoutingFields, splitList, targetSummary } from "./shared";

type Tab = "general" | "routing" | "payload" | "retries" | "pacing" | "webhook" | "advanced";
type Header = { name: string; value: string };

/** Everything about one destination, in one place. Nothing changes until you save. */
export function DestinationSettings({ destination: d, onClose, initialTab = "general" }: { destination: Destination; onClose: () => void; initialTab?: Tab }) {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const providers = useProviders();
  const policy = useDeliveryPolicy();
  const actions = useDestinationActions();
  const provider = providers.data?.providers.find((p) => p.id === d.provider);
  const isWebhook = d.provider === "webhook";
  const hasLabels = d.provider === "github" || d.provider === "gitlab";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [name, setName] = useState(d.name);
  const [enabled, setEnabled] = useState(d.enabled);
  const [syncState, setSyncState] = useState(d.syncState);
  const [rule, setRule] = useState<RoutingRule>(d.rule);
  const [events, setEvents] = useState<WebhookEvent[]>(d.events);
  const [labels, setLabels] = useState(Array.isArray(d.target.labels) ? (d.target.labels as string[]).join(", ") : "");
  const [url, setUrl] = useState("");
  const [overrides, setOverrides] = useState<Partial<DeliveryPolicy>>(d.policy ?? {});
  const [headers, setHeaders] = useState<Header[] | null>(null);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const base = policy.data?.effective;
  const dirty = useMemo(
    () =>
      name !== d.name ||
      enabled !== d.enabled ||
      syncState !== d.syncState ||
      JSON.stringify(rule) !== JSON.stringify(d.rule) ||
      JSON.stringify(events) !== JSON.stringify(d.events) ||
      labels !== (Array.isArray(d.target.labels) ? (d.target.labels as string[]).join(", ") : "") ||
      !!url.trim() ||
      headers !== null ||
      JSON.stringify(overrides) !== JSON.stringify(d.policy ?? {}),
    [name, enabled, syncState, rule, events, labels, url, headers, overrides, d],
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "general", label: "General" },
    { id: "routing", label: "Routing" },
    { id: "payload", label: "Content" },
    { id: "retries", label: "Retries" },
    { id: "pacing", label: "Pacing" },
    ...(isWebhook ? [{ id: "webhook" as Tab, label: "Webhook" }] : []),
    { id: "advanced", label: "Advanced" },
  ];

  const loadHeaders = async () => {
    setLoadingHeaders(true);
    try {
      const secrets = await api<{ headers?: Record<string, string> }>(path(`/projects/${d.projectId}/destinations/${d.id}/reveal`), { body: {} });
      setHeaders(Object.entries(secrets.headers ?? {}).map(([n, value]) => ({ name: n, value })));
    } catch (err) {
      toastError(describeError(err, "Couldn't load the headers."));
    } finally {
      setLoadingHeaders(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const cleanHeaders = headers?.filter((h) => h.name.trim());
      await api(path(`/projects/${d.projectId}/destinations/${d.id}`), {
        method: "PATCH",
        body: {
          name,
          rule,
          policy: base ? sparse(base, overrides) : overrides,
          ...(enabled !== d.enabled ? { enabled } : {}),
          ...(syncState !== d.syncState ? { syncState } : {}),
          ...(isWebhook ? { events, ...(url.trim() ? { url } : {}) } : {}),
          ...(cleanHeaders ? { headers: Object.fromEntries(cleanHeaders.map((h) => [h.name.trim(), h.value])) } : {}),
          ...(hasLabels ? { labels: splitList(labels) } : {}),
        },
      });
      for (const domain of ["destinations", "deliveries"]) qc.invalidateQueries({ queryKey: ["org", orgId, domain] });
      toast(`Saved ${name}`);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (dirty && !(await confirm({ title: "Discard your changes?", message: `The changes to ${d.name} haven't been saved.`, confirmLabel: "Discard", danger: true }))) return;
    onClose();
  };

  const rotate = async () => {
    const ok = await confirm({
      title: "Rotate the signing secret?",
      message: "Requests are signed with the new secret straight away. Your endpoint will reject them until you update it there too.",
      confirmLabel: "Rotate secret",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(path(`/projects/${d.projectId}/destinations/${d.id}/rotate`), { body: {} });
      toast("Rotated the signing secret");
    } catch (err) {
      toastError(describeError(err, "Couldn't rotate the secret."));
    }
  };

  return (
    <Sheet
      wide
      icon={<BrandIcon provider={d.provider} size={18} framed />}
      title={d.name}
      subtitle={[provider?.name, d.projectName, targetSummary(d)].filter(Boolean).join(" · ")}
      onClose={close}
      locked={busy}
      tabs={tabs}
      tab={tab}
      onTab={(t) => setTab(t as Tab)}
      footer={
        <>
          <Button variant="quiet" onClick={() => actions.sendTest(d)}>
            Send test
          </Button>
          <span className="mr-auto text-xs text-text-3">{dirty ? "Unsaved changes" : "Changes apply to the next delivery."}</span>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!dirty || !name.trim() || (isWebhook && !events.length)} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {error ? <Callout tone="danger">{describeError(error, "Couldn't save the destination.")}</Callout> : null}
      {d.pausedReason && (
        <Callout tone="warning" title="Paused by Issueit">
          {d.pausedReason}
        </Callout>
      )}

      {tab === "general" && (
        <>
          <SetGroup>
            <SetRow label="Delivering" hint={enabled ? "New reports are sent here." : "Paused. Reports still arrive in Issueit and aren't sent here."}>
              <Switch label="Delivering" checked={enabled} onChange={setEnabled} />
            </SetRow>
            {provider?.canSync && (
              <SetRow
                label="Resolve when the issue closes"
                hint={syncState ? `Issueit checks ${provider.name} every few minutes. Closing an issue there resolves its report and tells the reporters.` : "Off. Reports stay as they are when their issue closes."}
              >
                <Switch label="Resolve when the issue closes" checked={syncState} onChange={setSyncState} />
              </SetRow>
            )}
            {provider?.canComment && (
              <SetRow label="Repeats" hint="When the same bug is reported again, Issueit comments on the first issue at 2, 3, 5, 10, 25 reports and so on, instead of opening another." />
            )}
          </SetGroup>
          <Field label="Name" hint="Only used in Issueit.">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          {isWebhook && (
            <Field label="Endpoint URL" optional hint={`Currently ${d.webhookHost ?? "set"}. Leave empty to keep it.`}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="mono" />
            </Field>
          )}
          {hasLabels && (
            <Field label="Labels" optional hint="Comma-separated. Added to every issue.">
              <Input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="bug" />
            </Field>
          )}
          <SetGroup title="At a glance">
            <SetRow label="Delivered" hint={`${d.stats.weekDelivered} in the last 7 days`}>
              <span className="text-sm tabular">{d.stats.delivered.toLocaleString("en-GB")}</span>
            </SetRow>
            <SetRow label="Failed" hint={d.stats.lastError ?? "No recent errors."}>
              <span className={`text-sm tabular ${d.stats.failed ? "text-danger" : ""}`}>{d.stats.failed.toLocaleString("en-GB")}</span>
            </SetRow>
            <SetRow label="Average delivery time" hint="Over the last 30 days.">
              <span className="text-sm tabular">{d.stats.avgMs !== null ? `${d.stats.avgMs} ms` : "-"}</span>
            </SetRow>
            <SetRow label="Last activity" hint={d.connection ? `Connected as ${d.connection.account.label}` : undefined}>
              <span className="text-sm text-text-2">{relativeTime(d.stats.lastAt)}</span>
            </SetRow>
          </SetGroup>
        </>
      )}

      {tab === "routing" && (
        <>
          {isWebhook && (
            <div className="field">
              <span className="field__label">Send when</span>
              <EventFields events={events} onChange={setEvents} />
            </div>
          )}
          <div className="field">
            <span className="field__label">Which reports</span>
            <RoutingFields rule={rule} onChange={setRule} />
          </div>
        </>
      )}

      {(tab === "payload" || tab === "retries" || tab === "pacing") &&
        (!base ? (
          <Skeleton h={200} />
        ) : (
          <>
            <p className="hint -mb-2">Anything you don't change here follows the organisation's delivery defaults.</p>
            <PolicyEditor base={base} value={overrides} onChange={setOverrides} sections={[tab]} inheritsFrom="organisation default" />
            {tab === "retries" && merge(base, overrides).maxAttempts === 1 && (
              <Callout tone="warning">With one attempt, a short outage at {provider?.name ?? "the service"} loses the delivery. You can still retry it by hand.</Callout>
            )}
          </>
        ))}

      {tab === "webhook" && isWebhook && (
        <>
          <SetGroup title="Custom headers">
            {headers === null ? (
              <SetRow label={d.headerNames.length ? d.headerNames.join(", ") : "No custom headers"} hint="Sent with every request, e.g. an Authorization token. Stored encrypted.">
                <Button size="sm" busy={loadingHeaders} onClick={loadHeaders}>
                  Edit headers…
                </Button>
              </SetRow>
            ) : (
              <div className="p-3 flex flex-col gap-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      size_="sm"
                      aria-label="Header name"
                      placeholder="X-Api-Key"
                      className="mono !w-[40%]"
                      value={h.name}
                      onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <Input
                      size_="sm"
                      aria-label="Header value"
                      placeholder="Value"
                      className="mono flex-1"
                      value={h.value}
                      onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    />
                    <IconButton size="sm" icon={TrashBin2Icon} label="Remove header" onClick={() => setHeaders(headers.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <div>
                  <Button size="sm" icon={AddIcon} disabled={headers.length >= 20} onClick={() => setHeaders([...headers, { name: "", value: "" }])}>
                    Add header
                  </Button>
                </div>
                <p className="hint">Issueit sets Content-Type and the Issueit-* headers itself.</p>
              </div>
            )}
          </SetGroup>
          <SetGroup title="Signing secret">
            <div className="p-3 flex flex-col gap-2">
              <p className="text-sm text-text-2">
                Every request carries an <span className="mono">Issueit-Signature</span> header. Check it with this secret.{" "}
                <a href="/docs#webhooks" target="_blank" rel="noopener" className="underline underline-offset-2">
                  How to verify
                </a>
              </p>
              <SecretField
                what="signing secret"
                preview="whsec_••••••••••••••••••••••••"
                reveal={async () => (await api<{ signingSecret: string }>(path(`/projects/${d.projectId}/destinations/${d.id}/reveal`), { body: {} })).signingSecret}
              />
              <div>
                <Button size="sm" variant="danger" onClick={rotate}>
                  Rotate secret…
                </Button>
              </div>
            </div>
          </SetGroup>
        </>
      )}

      {tab === "advanced" && (
        <>
          <SetGroup title="Recovery">
            <SetRow label="Retry failed deliveries" hint={d.stats.failed ? `${d.stats.failed} failed. Queue them all again, e.g. after fixing a setting.` : "Nothing has failed."}>
              <Button size="sm" disabled={!d.stats.failed} onClick={() => actions.retryFailed({ destination: d.id }, d.name)}>
                Retry all
              </Button>
            </SetRow>
          </SetGroup>
          <SetGroup title="Details">
            <SetRow label="Destination id">
              <span className="mono text-xs text-text-2">{d.id}</span>
            </SetRow>
            <SetRow label="Created">
              <span className="text-sm text-text-2">{relativeTime(d.createdAt)}</span>
            </SetRow>
            {provider && (
              <SetRow label="Events it can act on">
                <span className="text-xs text-text-2 mono">{provider.events.join(", ")}</span>
              </SetRow>
            )}
          </SetGroup>
          <SetGroup title="Remove">
            <SetRow label="Remove this destination" hint="Stops deliveries and deletes its history. Issues it created stay where they are.">
              <Button size="sm" variant="danger" onClick={() => actions.remove(d, onClose)}>
                Remove…
              </Button>
            </SetRow>
          </SetGroup>
        </>
      )}
    </Sheet>
  );
}
