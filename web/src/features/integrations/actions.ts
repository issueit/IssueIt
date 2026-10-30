import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { plural } from "../../lib/format";
import { useOrg } from "../../lib/session";
import type { Destination } from "../../lib/types";
import { confirm } from "../../components/ui/Dialog";
import { toast, toastError } from "../../components/ui/Toast";

/** What you can do to a destination from any list of them. */
export function useDestinationActions() {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const base = (d: Pick<Destination, "projectId">) => `/projects/${d.projectId}/destinations`;

  const refresh = () => {
    for (const domain of ["destinations", "projects", "deliveries", "analytics"]) qc.invalidateQueries({ queryKey: ["org", orgId, domain] });
  };

  const setEnabled = async (d: Destination, enabled: boolean) => {
    const patch = (data: { destinations: Destination[] } | undefined) =>
      data && { destinations: data.destinations.map((x) => (x.id === d.id ? { ...x, enabled, pausedReason: null } : x)) };
    qc.setQueriesData<{ destinations: Destination[] }>({ queryKey: ["org", orgId, "destinations"] }, patch);
    try {
      await api(path(`${base(d)}/${d.id}`), { method: "PATCH", body: { enabled } });
      refresh();
      toast(enabled ? `Resumed ${d.name}` : `Paused ${d.name}`, { label: "Undo", run: () => setEnabled({ ...d, enabled }, !enabled) });
    } catch (err) {
      refresh();
      toastError(describeError(err, `Couldn't ${enabled ? "resume" : "pause"} ${d.name}.`), () => setEnabled(d, enabled));
    }
  };

  const sendTest = async (d: Destination) => {
    toast(`Sending a test to ${d.name}`);
    try {
      const res = await api<{ ok: boolean; error?: string; externalUrl?: string | null }>(path(`${base(d)}/${d.id}/test`), { body: {} });
      if (res.ok) toast(`Test delivered to ${d.name}`, res.externalUrl ? { label: "Open", run: () => window.open(res.externalUrl!, "_blank", "noopener") } : undefined);
      else toastError(res.error ?? `The test to ${d.name} didn't arrive.`, () => sendTest(d));
    } catch (err) {
      toastError(describeError(err, "Couldn't send the test."));
    } finally {
      refresh();
    }
  };

  const remove = async (d: Destination, after?: () => void) => {
    const ok = await confirm({
      title: `Remove ${d.name}?`,
      message: "New reports stop going there and its delivery history is deleted. Issues it already created stay where they are. To stop it for a while instead, pause it.",
      confirmLabel: "Remove destination",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(path(`${base(d)}/${d.id}`), { method: "DELETE" });
      refresh();
      toast(`Removed ${d.name}`);
      after?.();
    } catch (err) {
      toastError(describeError(err, "Couldn't remove the destination."));
    }
  };

  /** Queues another attempt for failed deliveries matching the filter. */
  const retryFailed = async (filter: { destination?: string; project?: string; provider?: string }, what: string) => {
    try {
      const { queued } = await api<{ queued: number }>(path("/deliveries/retry-failed"), { body: filter });
      refresh();
      toast(queued ? `Retrying ${plural(queued, "failed delivery", "failed deliveries")} to ${what}` : `Nothing has failed for ${what}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't retry the failed deliveries."));
    }
  };

  return { setEnabled, sendTest, remove, retryFailed, refresh };
}
