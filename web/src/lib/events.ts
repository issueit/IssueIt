import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** The dashboard can opt out of live chart updates; everything else always updates. */
let liveAnalytics = true;
export const setLiveAnalytics = (on: boolean) => {
  liveAnalytics = on;
};

/**
 * Live updates. The server pushes an event when a report arrives or a
 * delivery changes; each invalidates the query domains it affects, so the
 * dashboard never polls. The browser reconnects the stream by itself.
 */
export function useOrgEvents(orgId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const source = new EventSource(`/api/orgs/${orgId}/events`);
    const invalidate = (...domains: string[]) => {
      domains.forEach((d) => qc.invalidateQueries({ queryKey: ["org", orgId, d] }));
      if (liveAnalytics) qc.invalidateQueries({ queryKey: ["org", orgId, "analytics"] });
    };
    const onReport = () => invalidate("reports", "projects", "usage");
    const onDelivery = () => invalidate("deliveries", "destinations", "reports", "projects", "usage", "connections");
    for (const t of ["report.created", "report.updated", "report.deleted"]) source.addEventListener(t, onReport);
    source.addEventListener("delivery.updated", onDelivery);
    return () => source.close();
  }, [orgId, qc]);
}
