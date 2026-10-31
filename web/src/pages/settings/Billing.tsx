import { useState } from "react";
import { useSearchParams } from "react-router";
import { api, describeError } from "../../lib/api";
import { useOrg } from "../../lib/session";
import { useOrgQuery } from "../../lib/queries";
import { Button } from "../../components/ui/Button";
import { Segmented } from "../../components/ui/controls";
import { Callout, Skeleton, StatusPill } from "../../components/ui/feedback";
import { toastError } from "../../components/ui/Toast";
import { CheckCircleIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";

/**
 * The plan, what else there is, and the two buttons that change it. Issueit
 * never sees a card: both buttons hand over to Stripe, and the plan only
 * changes when Stripe's webhook says it has.
 */

type PlanView = {
  id: string;
  name: string;
  blurb: string;
  who: string;
  monthly: number;
  yearly: number;
  monthlyLabel: string;
  yearlyLabel: string;
  limits: {
    reportsPerMonth: number;
    projects: number;
    destinationsPerProject: number;
    members: number;
    retentionDays: number;
    attachmentBytes: number;
    attachmentsPerReport: number;
  };
  features: string[];
  current: boolean;
  buyable: boolean;
};

type Billing = {
  edition: "hosted" | "selfhost";
  billable: boolean;
  plan: string;
  planName: string;
  features: string[];
  trialDaysLeft: number | null;
  usage: { reports: number; refused: number };
  limits: PlanView["limits"];
  subscription: {
    status: string | null;
    periodEnd: string | null;
    cancelAt: string | null;
    interval: string | null;
    problem: string | null;
    manageable: boolean;
  };
  plans: PlanView[];
};

type Invoice = { id: string; number: string | null; status: string; total: number; currency: string; createdAt: string; url: string | null; pdf: string | null };

const featureLabels: Record<string, string> = {
  tokens: "Account tokens",
  mcp: "MCP endpoint for agents",
  rules: "Custom grouping and redaction",
  sourcemaps: "Releases and source maps",
  config: "Configuration as code",
  audit: "Audit log",
  digest: "Email digests",
  whitelabel: "No Issueit badge on the widget",
};

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const count = (n: number) => (n ? n.toLocaleString("en-GB") : "Unlimited");

export function BillingSettings() {
  const [params, setParams] = useSearchParams();
  const { path } = useOrg();
  const billing = useOrgQuery<Billing>("billing", [], "/billing");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const justPaid = params.get("paid") === "1";

  const go = async (where: "checkout" | "portal", plan?: string) => {
    setBusy(plan ?? where);
    try {
      const { url } = await api<{ url: string }>(path(`/billing/${where}`), { body: where === "checkout" ? { plan, interval } : {} });
      window.location.href = url;
    } catch (err) {
      toastError(describeError(err, "Couldn't open Stripe. Try again in a moment."));
      setBusy(null);
    }
  };

  if (billing.isPending) return <Skeleton h={220} />;
  if (billing.isError) {
    return (
      <Callout tone="danger" action={<Button size="sm" onClick={() => billing.refetch()}>Try again</Button>}>
        {describeError(billing.error, "Couldn't load the plan.")}
      </Callout>
    );
  }

  const b = billing.data;

  if (b.edition === "selfhost") {
    return (
      <>
        <h2 className="page-title mb-4">Billing</h2>
        <Callout tone="info" title="This is your own install">
          Nothing to pay and nothing held back: every feature is on, and the limits are the ones in your environment. Usage and limits are under{" "}
          <a className="underline underline-offset-2" href="usage">
            Usage and limits
          </a>
          .
        </Callout>
      </>
    );
  }

  const used = b.usage.reports;
  const limit = b.limits.reportsPerMonth;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <>
      <h2 className="page-title mb-4">Billing</h2>

      {justPaid && (
        <div className="mb-4">
          <Callout
            tone="success"
            title="Thanks — that's gone through"
            action={
              <Button
                size="sm"
                onClick={() => {
                  params.delete("paid");
                  setParams(params, { replace: true });
                  void billing.refetch();
                }}
              >
                Dismiss
              </Button>
            }
          >
            Stripe confirms a plan a moment after payment, so if this page still says otherwise, refresh in a few seconds.
          </Callout>
        </div>
      )}

      {b.subscription.problem && (
        <div className="mb-4">
          <Callout tone="danger" title="Your last payment didn't go through" action={<Button size="sm" onClick={() => go("portal")}>Update card</Button>}>
            {b.subscription.problem} Issueit is still collecting your reports.
          </Callout>
        </div>
      )}

      <SetGroup title="Your plan">
        <SetRow
          label={
            <span className="flex items-center gap-2">
              {b.planName}
              {b.trialDaysLeft !== null && <StatusPill tone="active">{b.trialDaysLeft ? `trial, ${b.trialDaysLeft} ${b.trialDaysLeft === 1 ? "day" : "days"} left` : "trial over"}</StatusPill>}
              {b.subscription.status === "past_due" && <StatusPill tone="danger">payment due</StatusPill>}
              {b.subscription.cancelAt && <StatusPill tone="warning">ends {date(b.subscription.cancelAt)}</StatusPill>}
            </span>
          }
          hint={
            b.subscription.cancelAt
              ? `Cancelled, so it runs until ${date(b.subscription.cancelAt)} and then moves to Free.`
              : b.subscription.periodEnd
                ? `Renews ${date(b.subscription.periodEnd)}, ${b.subscription.interval === "year" ? "yearly" : "monthly"}.`
                : b.trialDaysLeft !== null
                  ? "A trial is a plan with an end date: choose one before it runs out and nothing changes."
                  : "Free, for as long as you like."
          }
        >
          {b.subscription.manageable && (
            <Button size="sm" busy={busy === "portal"} onClick={() => go("portal")}>
              Manage in Stripe
            </Button>
          )}
        </SetRow>
        <SetRow
          label={`${used.toLocaleString("en-GB")} of ${count(limit)} reports this month`}
          hint={
            b.usage.refused
              ? `${b.usage.refused.toLocaleString("en-GB")} ${b.usage.refused === 1 ? "report was" : "reports were"} turned away this month. Those are bugs your users reported and you can't see.`
              : limit
                ? "Issueit accepts a tenth over the allowance before it turns anything away."
                : "No monthly limit on this plan."
          }
        >
          {limit ? (
            <div className="w-[160px]">
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" role="meter" aria-label="Reports used" aria-valuenow={used} aria-valuemax={limit} aria-valuemin={0}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "var(--danger)" : pct > 75 ? "var(--warning)" : "var(--text-2)" }} />
              </div>
              <div className="mt-1 text-right text-xs text-text-3 tabular">{pct}% used</div>
            </div>
          ) : null}
        </SetRow>
      </SetGroup>

      {!b.billable ? (
        <Callout tone="warning" title="Payments aren't switched on here">
          This install has no Stripe keys, so plans can't be changed from the dashboard.
        </Callout>
      ) : (
        <section className="mb-5">
          <div className="flex items-end justify-between mb-2 gap-3">
            <div>
              <h2 className="set-group__title !mb-0.5">Plans</h2>
              <p className="hint ml-0.5">Change whenever. Stripe works out the difference and the tax.</p>
            </div>
            <Segmented
              value={interval}
              onChange={setInterval}
              ariaLabel="Billed monthly or yearly"
              options={[
                { value: "month", label: "Monthly" },
                { value: "year", label: "Yearly" },
              ]}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {b.plans.map((p) => (
              <div key={p.id} className={`rounded-lg border p-3.5 flex flex-col gap-2.5 ${p.current ? "border-text-3 bg-surface-2" : "border-border-subtle"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.current ? <StatusPill tone="active">current</StatusPill> : null}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-semibold tabular">{interval === "month" ? p.monthlyLabel : p.yearlyLabel}</span>
                  {p.monthly > 0 && <span className="text-xs text-text-3">{interval === "month" ? "a month" : "a year"}</span>}
                </div>
                <p className="text-sm text-text-2">{p.blurb}</p>
                <ul className="flex flex-col gap-1 text-xs text-text-2">
                  <li className="tabular">{count(p.limits.reportsPerMonth)} reports a month</li>
                  <li className="tabular">
                    {count(p.limits.projects)} projects · {count(p.limits.members)} people
                  </li>
                  <li className="tabular">{p.limits.retentionDays ? `${p.limits.retentionDays} days` : "Unlimited"} of screenshots and diagnostics</li>
                  {Object.keys(featureLabels)
                    .filter((f) => p.features.includes(f) && !["tokens", "mcp"].includes(f))
                    .map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <CheckCircleIcon size={12} />
                        {featureLabels[f]}
                      </li>
                    ))}
                </ul>
                <div className="mt-auto pt-1">
                  {p.current ? (
                    <Button size="sm" disabled>
                      Your plan
                    </Button>
                  ) : p.monthly === 0 ? (
                    <Button size="sm" onClick={() => go("portal")} disabled={!b.subscription.manageable}>
                      Cancel to move here
                    </Button>
                  ) : (
                    <Button size="sm" variant="primary" busy={busy === p.id} disabled={!p.buyable} onClick={() => go("checkout", p.id)}>
                      {p.buyable ? `Choose ${p.name}` : "Not available yet"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {b.subscription.manageable && <Invoices />}
    </>
  );
}

function Invoices() {
  const invoices = useOrgQuery<{ invoices: Invoice[] }>("billing", ["invoices"], "/billing/invoices");
  if (invoices.isPending || invoices.isError || !invoices.data.invoices.length) return null;
  return (
    <SetGroup title="Invoices">
      {invoices.data.invoices.map((i) => (
        <SetRow
          key={i.id}
          label={<span className="tabular">{new Intl.NumberFormat("en-GB", { style: "currency", currency: i.currency }).format(i.total / 100)}</span>}
          hint={`${i.number ?? i.id} · ${date(i.createdAt)}${i.status === "paid" ? "" : ` · ${i.status}`}`}
        >
          {i.pdf && (
            <a className="text-xs text-text-2 hover:text-text" href={i.pdf} target="_blank" rel="noreferrer">
              PDF
            </a>
          )}
        </SetRow>
      ))}
    </SetGroup>
  );
}
