import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { sparse } from "../../lib/policy";
import { useDeliveryPolicy, useOrgDestinations } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { DeliveryPolicy } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Callout, Skeleton } from "../../components/ui/feedback";
import { toast } from "../../components/ui/Toast";
import { PolicyEditor } from "../../features/integrations/PolicyEditor";

/** Organisation-wide delivery defaults. Each destination can still override any of them. */
export function DeliverySettings() {
  const { org, orgId, path } = useOrg();
  const qc = useQueryClient();
  const policy = useDeliveryPolicy();
  const destinations = useOrgDestinations();
  const owner = org.role === "owner";
  const [value, setValue] = useState<Partial<DeliveryPolicy>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (policy.data) setValue(policy.data.organisation);
  }, [policy.data]);

  if (policy.isPending) return <Skeleton h={300} />;
  if (!policy.data) return <Callout tone="danger">{describeError(policy.error, "Couldn't load the delivery defaults.")}</Callout>;

  const builtIn = policy.data.builtIn;
  const dirty = JSON.stringify(sparse(builtIn, value)) !== JSON.stringify(sparse(builtIn, policy.data.organisation));
  const overriding = (destinations.data?.destinations ?? []).filter((d) => Object.keys(d.policy ?? {}).length).length;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(path(""), { method: "PATCH", body: { settings: { delivery: sparse(builtIn, value) } } });
      await qc.invalidateQueries({ queryKey: ["org", orgId, "policy"] });
      toast("Saved the delivery defaults");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="page-title mb-1">Delivery defaults</h2>
      <p className="text-sm text-text-3 mb-4">
        How Issueit delivers to every destination in {org.name}: retries, timeouts, pacing and what each report carries. Destinations can override any of these in their own settings
        {overriding ? ` (${overriding} currently do)` : ""}.
      </p>
      {!owner && (
        <div className="mb-4">
          <Callout tone="info">Only owners can change the organisation's defaults.</Callout>
        </div>
      )}
      {error ? (
        <div className="mb-4">
          <Callout tone="danger">{describeError(error, "Couldn't save the delivery defaults.")}</Callout>
        </div>
      ) : null}
      <PolicyEditor base={builtIn} value={value} onChange={setValue} sections={["retries", "pacing", "payload"]} inheritsFrom="built-in default" disabled={!owner} />
      {owner && (
        <div className="sticky bottom-0 flex items-center gap-2 py-3 bg-bg border-t border-border-subtle">
          <span className="mr-auto text-xs text-text-3">{dirty ? "Unsaved changes. They apply to the next delivery." : "Saved."}</span>
          <Button disabled={!dirty || busy} onClick={() => setValue(policy.data.organisation)}>
            Discard
          </Button>
          <Button variant="primary" busy={busy} disabled={!dirty} onClick={save}>
            Save defaults
          </Button>
        </div>
      )}
    </>
  );
}
