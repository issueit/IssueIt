import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useOrg } from "../../lib/session";
import { useOrgQuery } from "../../lib/queries";
import { Button } from "../../components/ui/Button";
import { Checkbox, Segmented, Switch } from "../../components/ui/controls";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { toast, toastError } from "../../components/ui/Toast";
import { SetGroup, SetRow } from "../../components/ui/layout";

/**
 * What Issueit emails this person about this organisation. Quiet by default
 * beyond critical reports: the fastest way to make somebody ignore Issueit's
 * email is to send too much of it.
 */

type Notify = { reports: "off" | "critical" | "high" | "all"; pipeline: boolean; digest: "off" | "daily" | "weekly"; mutedProjects: string[] };
type Settings = { notify: Notify; defaults: Notify; projects: Array<{ id: string; name: string }>; email: boolean; digestAvailable: boolean };

export function NotificationSettings() {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const settings = useOrgQuery<Settings>("notifications", [], "/notifications");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = async (patch: Partial<Notify>) => {
    setBusy(true);
    try {
      const next = await api<{ notify: Notify }>(path("/notifications"), { method: "PATCH", body: patch });
      qc.setQueryData(["org", orgId, "notifications"], (old: Settings | undefined) => (old ? { ...old, notify: next.notify } : old));
    } catch (err) {
      toastError(describeError(err, "Couldn't save that."));
      void settings.refetch();
    } finally {
      setBusy(false);
    }
  };

  if (settings.isPending) return <Skeleton h={200} />;
  if (settings.isError) {
    return (
      <Callout tone="danger" action={<Button size="sm" onClick={() => settings.refetch()}>Try again</Button>}>
        {describeError(settings.error, "Couldn't load your notification settings.")}
      </Callout>
    );
  }

  const { notify, projects, email, digestAvailable } = settings.data;

  return (
    <>
      <h2 className="page-title mb-1">Notifications</h2>
      <p className="hint mb-4">Yours alone, and only for this organisation.</p>

      {!email && (
        <div className="mb-4">
          <Callout tone="warning" title="This server can't send email">
            Nothing here will arrive until an operator sets <code className="mono">SMTP_URL</code>. Your choices are still saved.
          </Callout>
        </div>
      )}

      <SetGroup title="As reports arrive">
        <SetRow label="Email me about" hint="Duplicates joining an open bug are never emailed: you've already been told about that one.">
          <Segmented
            value={notify.reports}
            onChange={(v) => void save({ reports: v })}
            ariaLabel="Which reports to email me about"
            options={[
              { value: "off", label: "Nothing" },
              { value: "critical", label: "Critical" },
              { value: "high", label: "High and up" },
              { value: "all", label: "Everything" },
            ]}
          />
        </SetRow>
        <SetRow label="When Issueit pauses a destination" hint="Deliveries that keep failing pause the destination. Reports are still collected, but nothing leaves.">
          <Switch checked={notify.pipeline} onChange={(v) => void save({ pipeline: v })} label="Tell me when a destination is paused" disabled={busy} />
        </SetRow>
      </SetGroup>

      <SetGroup title="Summaries">
        <SetRow
          label="Digest"
          hint={digestAvailable ? "What arrived, what was resolved, what's stuck. Nothing is sent on a quiet day." : "Digests are part of Solo and above."}
        >
          <Segmented
            value={notify.digest}
            onChange={(v) => void save({ digest: v })}
            ariaLabel="How often to send a digest"
            options={[
              { value: "off", label: "Off" },
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]}
            disabled={!digestAvailable}
          />
        </SetRow>
        <SetRow label="Send one now" hint="A digest with this organisation's real numbers, to your own address.">
          <Button
            size="sm"
            busy={testing}
            disabled={!email}
            onClick={async () => {
              setTesting(true);
              try {
                const { to } = await api<{ to: string }>(path("/notifications/test"), { body: {} });
                toast(`Digest sent to ${to}`);
              } catch (err) {
                toastError(describeError(err, "Couldn't send that."));
              } finally {
                setTesting(false);
              }
            }}
          >
            Send me one
          </Button>
        </SetRow>
      </SetGroup>

      {projects.length > 1 && (
        <SetGroup title="Projects to stay quiet about">
          <div className="p-3.5 flex flex-col gap-2">
            <p className="hint">Muting a project stops its reports and its destination problems reaching you. Everyone else still hears about them.</p>
            {projects.map((p) => (
              <Checkbox
                key={p.id}
                checked={notify.mutedProjects.includes(p.id)}
                disabled={busy}
                onChange={(on) => void save({ mutedProjects: on ? [...notify.mutedProjects, p.id] : notify.mutedProjects.filter((id) => id !== p.id) })}
              >
                {p.name}
              </Checkbox>
            ))}
          </div>
        </SetGroup>
      )}
    </>
  );
}
