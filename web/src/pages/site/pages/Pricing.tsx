import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { PageHead, SitePage } from "../chrome";
import { Article, C, Note, Section, Table } from "../prose";
import { Segmented } from "../../../components/ui/controls";
import { CheckCircleIcon } from "../../../components/ui/icons";

/**
 * What Issueit costs, read from the server's own plan table rather than
 * typed out again here: the page and the thing it charges for can't disagree.
 */

type Plan = {
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
};

const featureNames: Array<[string, string]> = [
  ["rules", "Your own grouping and redaction rules"],
  ["sourcemaps", "Releases and source maps"],
  ["config", "Configuration as code"],
  ["audit", "Audit log"],
  ["digest", "Daily or weekly digest"],
  ["whitelabel", "No Issueit badge on the widget"],
];

const count = (n: number) => (n ? n.toLocaleString("en-GB") : "Unlimited");
const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export default function Pricing() {
  const [interval, setInterval] = useState<"month" | "year">("month");
  const pricing = useQuery({
    queryKey: ["plans"],
    queryFn: () => api<{ edition: string; billable: boolean; trialDays: number; plans: Plan[] }>("/plans"),
    staleTime: 300_000,
  });
  const plans = pricing.data?.plans ?? [];
  const trialDays = pricing.data?.trialDays ?? 14;
  /** False when these are the hosted service's plans seen from somebody's own install. */
  const here = pricing.data?.billable !== false;

  return (
    <SitePage title="Pricing">
      <PageHead
        eyebrow="Pricing"
        title={
          <>
            Pay for the reports you
            <br />
            actually receive.
          </>
        }
        lead="No per-seat pricing: invite everyone who fixes things. A plan is a monthly allowance of bug reports, how long their screenshots are kept, and which of the developer tooling you get."
      />

      <Article
        toc={[
          ["plans", "Plans"],
          ["included", "In every plan"],
          ["limits", "The numbers"],
          ["questions", "Questions"],
          ["self-host", "Running it yourself"],
        ]}
      >
        <Section id="plans" title="Plans">
          {plans.length ? (
            <>
              <div className="flex justify-center mb-5">
                <Segmented
                  ariaLabel="Billed monthly or yearly"
                  value={interval}
                  onChange={setInterval}
                  options={[
                    { value: "month", label: "Monthly" },
                    { value: "year", label: "Yearly, two months off" },
                  ]}
                />
              </div>
              <div className="price-grid">
                {plans.map((p, i) => (
                  <div key={p.id} className="price-card fade-up" style={{ "--d": `${i * 70}ms` } as CSSProperties} data-featured={p.id === "team" || undefined}>
                    <h3>{p.name}</h3>
                    <p className="price-who">{p.who}</p>
                    <p className="price-amount">
                      <span>{interval === "month" ? p.monthlyLabel : p.yearlyLabel}</span>
                      {p.monthly > 0 && <small>{interval === "month" ? "/month" : "/year"}</small>}
                    </p>
                    <p className="price-blurb">{p.blurb}</p>
                    <ul className="price-list">
                      <li>
                        <strong>{count(p.limits.reportsPerMonth)}</strong> reports a month
                      </li>
                      <li>
                        {count(p.limits.projects)} {p.limits.projects === 1 ? "project" : "projects"}
                      </li>
                      <li>{count(p.limits.members)} people</li>
                      <li>
                        {p.limits.retentionDays ? `${p.limits.retentionDays} days` : "Unlimited"} of screenshots and diagnostics
                      </li>
                      <li>{mb(p.limits.attachmentBytes)} attachments</li>
                      {featureNames
                        .filter(([key]) => p.features.includes(key))
                        .map(([key, label]) => (
                          <li key={key} className="price-has">
                            <CheckCircleIcon size={13} />
                            {label}
                          </li>
                        ))}
                    </ul>
                    {here ? (
                      <Link to="/signup" className={`btn btn--sm site-btn ${p.id === "team" ? "btn--primary" : ""}`}>
                        {p.monthly ? `Start with ${p.name}` : "Start free"}
                      </Link>
                    ) : (
                      <a href={`https://issueit.app/pricing`} className={`btn btn--sm site-btn ${p.id === "team" ? "btn--primary" : ""}`}>
                        {p.monthly ? `Start with ${p.name}` : "Start free"}
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <Note>
                {here ? (
                  <>
                    Every new organisation starts with {trialDays} days of Team, no card. When it runs out you move to Free and keep everything — a smaller allowance, not a
                    locked account.
                  </>
                ) : (
                  <>
                    These are the plans on the hosted service at issueit.app. <strong>This install isn't selling anything</strong>: it has every feature on, and the only
                    limits are the ones its operator set. See <Link to="/platform#limits">Limits</Link>.
                  </>
                )}
              </Note>
            </>
          ) : (
            <p>Loading the plans…</p>
          )}
        </Section>

        <Section id="included" title="In every plan, including free">
          <ul>
            <li>The widget, the hosted form and the REST API, with screenshots, video, console errors, network requests and the steps that led there.</li>
            <li>
              All {130}+ destinations: GitHub, Linear, Jira, Slack, Teams, Discord, Zendesk, PagerDuty, Sheets, your own webhook, anything.
            </li>
            <li>Duplicate grouping, the delivery outbox with retries and backoff, and the loop closed when a tracker's issue is closed.</li>
            <li>
              Account tokens and the <C>/mcp</C> endpoint, so a coding agent can read and file bugs. The command line is the same: it's free because it's the reason to try
              Issueit, not a reason to pay for it.
            </li>
            <li>Reporter emails, a world map, analytics, and no limit on how many people you invite.</li>
          </ul>
        </Section>

        <Section id="limits" title="The numbers">
          {plans.length > 0 && (
            <Table
              head={["", ...plans.map((p) => p.name)]}
              rows={[
                ["Reports a month", ...plans.map((p) => count(p.limits.reportsPerMonth))],
                ["Projects", ...plans.map((p) => count(p.limits.projects))],
                ["Destinations per project", ...plans.map((p) => count(p.limits.destinationsPerProject))],
                ["People", ...plans.map((p) => count(p.limits.members))],
                ["Screenshots kept", ...plans.map((p) => (p.limits.retentionDays ? `${p.limits.retentionDays} days` : "Unlimited"))],
                ["Attachment size", ...plans.map((p) => mb(p.limits.attachmentBytes))],
                ["Attachments per report", ...plans.map((p) => String(p.limits.attachmentsPerReport))],
                ...featureNames.map(([key, label]) => [label, ...plans.map((p) => (p.features.includes(key) ? "Yes" : "—"))] as string[]),
              ]}
            />
          )}
        </Section>

        <Section id="questions" title="Questions">
          <h3>What happens when I use up a month's reports?</h3>
          <p>
            Issueit keeps accepting a tenth over the allowance, then starts refusing with a clear error and counting what it turned away. A real bug report from a real user is
            worth more than a tidy line, so nothing is silently dropped, and the dashboard tells you exactly how many you missed.
          </p>

          <h3>Do you charge per person?</h3>
          <p>
            No. Charging for seats would mean you don't invite the person who can fix the bug, which defeats the point. Free is capped at three people to keep it honest; every
            paid plan from Team upwards has no limit.
          </p>

          <h3>Can I change or cancel?</h3>
          <p>
            Whenever you like, in Settings › Billing. Stripe works out the difference and the tax. Cancelling leaves you on your plan until the period ends, then moves you to
            Free; your reports, projects and destinations stay where they are.
          </p>

          <h3>What happens to my data if I stop paying?</h3>
          <p>
            Nothing is deleted because of a plan change. Attachments and captured diagnostics follow the retention of the plan you're on, which is the one thing that shrinks
            when you move down.
          </p>
        </Section>

        <Section id="self-host" title="Running it yourself">
          <p>
            Issueit can also run on your own server with <C>docker compose</C>, where there is nothing to pay and nothing held back: every feature is on and the limits are
            whatever you set in the environment. See <Link to="/platform#environment">the environment reference</Link>.
          </p>
        </Section>
      </Article>
    </SitePage>
  );
}
