import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { describeError } from "../../lib/api";
import { useDestinations } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import { Button } from "../../components/ui/Button";
import { Callout, EmptyState, SkeletonRows } from "../../components/ui/feedback";
import { AddIcon, PlugCircleIcon } from "../../components/ui/icons";
import { AddDestination, type WizardStart } from "../../features/integrations/AddDestination";
import { DeliveryLog } from "../../features/integrations/DeliveryLog";
import { DestinationsTable } from "../integrations/Integrations";
import { useProjectContext } from "./ProjectLayout";

export function ProjectIntegrations() {
  const { project } = useProjectContext();
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const destinations = useDestinations(project.id);
  const [params, setParams] = useSearchParams();
  const [wizard, setWizard] = useState<WizardStart | null>(null);

  // Coming back from an OAuth sign-in: resume the wizard where it left off.
  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("connectError");
    const provider = params.get("provider") ?? undefined;
    if (!connected && !error) return;
    qc.invalidateQueries({ queryKey: ["org", orgId, "connections"] });
    setWizard(connected ? { provider, connectionId: connected } : { provider, error: error ?? undefined });
    setParams({}, { replace: true });
  }, [params, setParams, qc, orgId]);

  const list = destinations.data?.destinations ?? [];

  return (
    <div className="page-body flex flex-col gap-7 max-w-[1080px]">
      <section>
        <div className="flex items-end justify-between gap-3 mb-2">
          <div>
            <h2 className="set-group__title !mb-0.5">Destinations</h2>
            <p className="hint ml-0.5">
              Reports are always saved in Issueit first. Retries, pacing and content are set per destination, on top of the{" "}
              <Link to="/settings/delivery" className="underline underline-offset-2">
                delivery defaults
              </Link>
              .
            </p>
          </div>
          <Button size="sm" variant="primary" icon={AddIcon} onClick={() => setWizard({})}>
            Add destination
          </Button>
        </div>

        {destinations.isPending ? (
          <SkeletonRows rows={2} />
        ) : destinations.isError ? (
          <Callout tone="danger" action={<Button size="sm" onClick={() => destinations.refetch()}>Try again</Button>}>
            {describeError(destinations.error, "Couldn't load destinations.")}
          </Callout>
        ) : !list.length ? (
          <div className="list">
            <EmptyState
              icon={PlugCircleIcon}
              title="No destinations yet"
              action={
                <Button variant="primary" icon={AddIcon} onClick={() => setWizard({})}>
                  Add destination
                </Button>
              }
            >
              Send new reports to GitHub, Jira, Slack, Teams, Zendesk, PagerDuty and more than 120 other services, or your own webhook.
            </EmptyState>
          </div>
        ) : (
          <DestinationsTable destinations={list} showProject={false} />
        )}
      </section>

      {list.length > 0 && <DeliveryLog scope={{ project: project.id }} destinations={list.map((d) => ({ value: d.id, label: d.name }))} />}

      {wizard && <AddDestination projectId={project.id} start={wizard} onClose={() => setWizard(null)} />}
    </div>
  );
}
