import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useOrg } from "../../lib/session";
import { useOrgQuery } from "../../lib/queries";
import { Button, IconButton } from "../../components/ui/Button";
import { toast, toastError } from "../../components/ui/Toast";
import { CheckCircleIcon, CloseIcon } from "../../components/ui/icons";

/**
 * The first ten minutes, on the dashboard until it's finished. Every step is
 * worked out from what exists, so it can't go stale, and it disappears on
 * its own rather than needing to be dismissed — though it can be.
 */

type Step = { id: string; title: string; hint: string; done: boolean; href: string; optional?: boolean };
type Onboarding = {
  steps: Step[];
  done: number;
  total: number;
  complete: boolean;
  waitingForFirstReport: boolean;
  firstProject: { id: string; name: string | null } | null;
};

const DISMISSED = "issueit.onboarding.dismissed";

export function OnboardingCard() {
  const { path } = useOrg();
  const qc = useQueryClient();
  const state = useOrgQuery<Onboarding>("onboarding", [], "/onboarding");
  const [hidden, setHidden] = useState(() => localStorage.getItem(DISMISSED) === "1");
  const [busy, setBusy] = useState(false);

  if (hidden || state.isPending || state.isError || state.data.complete) return null;
  const o = state.data;

  const sendTest = async () => {
    if (!o.firstProject) return;
    setBusy(true);
    try {
      const { report } = await api<{ report: { number: number } }>(path("/onboarding/test-report"), { body: { project: o.firstProject.id } });
      toast(`Test report #${report.number} filed`);
      await Promise.all([state.refetch(), qc.invalidateQueries({ queryKey: ["org"] })]);
    } catch (err) {
      toastError(describeError(err, "Couldn't file a test report."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dash-card" data-size="full" aria-label="Setting up">
      <header className="flex items-center gap-2">
        <h2 className="dash-card__title flex-1">
          Setting up · {o.done} of {o.total}
        </h2>
        <IconButton
          size="sm"
          icon={CloseIcon}
          label="Hide this"
          onClick={() => {
            localStorage.setItem(DISMISSED, "1");
            setHidden(true);
          }}
        />
      </header>

      <div className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden" role="meter" aria-valuenow={o.done} aria-valuemax={o.total} aria-valuemin={0} aria-label="Steps done">
        <div className="h-full rounded-full bg-text-2 transition-[width] duration-500" style={{ width: `${(o.done / o.total) * 100}%` }} />
      </div>

      <ol className="mt-3 flex flex-col">
        {o.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5 py-2 border-t border-border-subtle first:border-t-0">
            <span className={`mt-0.5 shrink-0 ${step.done ? "text-success" : "text-text-3"}`} aria-hidden>
              {step.done ? <CheckCircleIcon size={15} /> : <span className="block w-[15px] h-[15px] rounded-full border border-current" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block text-sm ${step.done ? "text-text-3 line-through" : "font-medium"}`}>
                {step.title}
                {step.optional && !step.done ? <span className="optional"> (optional)</span> : null}
              </span>
              {!step.done && <span className="block text-xs text-text-3 mt-0.5">{step.hint}</span>}
            </span>
            {!step.done && (
              <Link to={step.href} className="btn btn--sm shrink-0">
                Go
              </Link>
            )}
          </li>
        ))}
      </ol>

      {o.waitingForFirstReport && o.firstProject && (
        <p className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-3 flex items-center gap-2 flex-wrap">
          <span className="flex-1 min-w-[180px]">Not ready to install it yet? File a sample report to see the whole pipeline work.</span>
          <Button size="sm" busy={busy} onClick={sendTest}>
            Send a test report
          </Button>
        </p>
      )}
    </section>
  );
}
