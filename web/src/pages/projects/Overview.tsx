import { useState } from "react";
import { Link } from "react-router";
import { plural, relativeTime } from "../../lib/format";
import { useDestinations, useReports } from "../../lib/queries";
import { ButtonLink } from "../../components/ui/Button";
import { CodeBlock, CopyField } from "../../components/ui/Copy";
import { Segmented } from "../../components/ui/controls";
import { Callout, Skeleton, StatusPill } from "../../components/ui/feedback";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { SquareArrowRightUpIcon } from "../../components/ui/icons";
import { PriorityLabel, ReportStatusPill } from "../../components/app/status";
import { useProjectContext } from "./ProjectLayout";
import { curlSnippet, widgetSnippet } from "./snippets";

type Method = "widget" | "form" | "api";

export function ProjectOverview() {
  const { project, links, stats } = useProjectContext();
  const [method, setMethod] = useState<Method>("widget");
  const recent = useReports({ project: project.id, status: "all" });
  const destinations = useDestinations(project.id);
  const reports = recent.data?.pages[0]?.reports.slice(0, 5) ?? [];
  const base = `/projects/${project.id}`;

  return (
    <div className="page-body page-body--narrow flex flex-col gap-7">
      <div>
        {project.description && <p className="text-sm text-text-2 mb-2">{project.description}</p>}
        <p className="text-sm text-text-3 tabular">
          {plural(stats.total, "report")} · {stats.open} open · {stats.week} this week
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="set-group__title !m-0">Collect reports</h2>
          <Segmented<Method>
            ariaLabel="Collection method"
            value={method}
            onChange={setMethod}
            options={[
              { value: "widget", label: "Widget" },
              { value: "form", label: "Hosted form" },
              { value: "api", label: "API" },
            ]}
          />
        </div>
        <div className="set-group p-3.5 flex flex-col gap-3">
          {method === "widget" && (
            <>
              <p className="text-sm text-text-2">Add this before the closing &lt;/body&gt; tag. A small report button appears in the corner of every page.</p>
              <CodeBlock code={widgetSnippet(project.id, links)} what="widget code" />
              <div className="flex gap-2">
                <ButtonLink to={`${base}/widget`} size="sm">
                  Customise the widget
                </ButtonLink>
              </div>
            </>
          )}
          {method === "form" && (
            <>
              <p className="text-sm text-text-2">A page anyone can use to report a bug, no account needed. Link to it from your app or help centre.</p>
              <CopyField value={links.formUrl} what="form link" />
              <div>
                <ButtonLink to={links.formUrl} size="sm" external icon={SquareArrowRightUpIcon}>
                  Open the form
                </ButtonLink>
              </div>
            </>
          )}
          {method === "api" && (
            <>
              <p className="text-sm text-text-2">
                Send reports from your own interface. From a server, add a secret key from{" "}
                <Link to={`${base}/keys`} className="underline underline-offset-2">
                  API keys
                </Link>
                .
              </p>
              <CopyField value={links.endpoint} what="endpoint" />
              <CodeBlock code={curlSnippet(links)} what="example request" />
            </>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="set-group__title !m-0">Delivering to</h2>
          <Link to={`${base}/integrations`} className="text-xs text-text-3 hover:text-text">
            Manage
          </Link>
        </div>
        {destinations.isPending ? (
          <Skeleton h={44} />
        ) : !destinations.data?.destinations.length ? (
          <Callout tone="info" title="Reports stay in Issueit for now" action={<ButtonLink to={`${base}/integrations`} size="sm">Add destination…</ButtonLink>}>
            Send new reports to GitHub, Linear, ClickUp, Discord or your own webhook.
          </Callout>
        ) : (
          <div className="list">
            {destinations.data.destinations.map((d) => (
              <Link key={d.id} to={`${base}/integrations`} className="list-row">
                <span className="text-text-2">
                  <BrandIcon provider={d.provider} size={14} />
                </span>
                <span className="flex-1 truncate text-sm">{d.name}</span>
                {!d.enabled ? (
                  <StatusPill plain>Paused</StatusPill>
                ) : d.connection?.status === "error" || d.stats.lastStatus === "failed" ? (
                  <StatusPill tone="danger" plain>
                    Failing
                  </StatusPill>
                ) : (
                  <StatusPill tone="success" plain>
                    {d.stats.delivered ? `${d.stats.delivered} delivered` : "Ready"}
                  </StatusPill>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="set-group__title !m-0">Recent reports</h2>
          {reports.length > 0 && (
            <Link to={`${base}/reports`} className="text-xs text-text-3 hover:text-text">
              View all
            </Link>
          )}
        </div>
        {recent.isPending ? (
          <Skeleton h={120} />
        ) : !reports.length ? (
          <p className="text-sm text-text-3">Nothing yet. Reports appear here as soon as they arrive - no need to refresh.</p>
        ) : (
          <div className="list">
            {reports.map((r) => (
              <Link key={r.id} to={`${base}/reports/${r.id}`} className="list-row">
                <PriorityLabel priority={r.priority} showText={false} />
                <span className="flex-1 truncate text-sm">{r.title}</span>
                <ReportStatusPill status={r.status} />
                <span className="w-14 text-right text-xs text-text-3">{relativeTime(r.createdAt, false)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
