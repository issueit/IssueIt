import { Link, Navigate } from "react-router";
import { relativeTime } from "../../lib/format";
import { useProjects } from "../../lib/queries";
import { ButtonLink } from "../../components/ui/Button";
import { EmptyState, SkeletonRows } from "../../components/ui/feedback";
import { WidgetIcon } from "../../components/ui/icons";
import { PageHeader } from "../../components/ui/layout";

/** The widget is set per project: go straight there when there's only one. */
export function WidgetHome() {
  const projects = useProjects();
  const list = projects.data?.projects ?? [];
  if (list.length === 1) return <Navigate to={`/projects/${list[0].id}/widget`} replace />;
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader icon={WidgetIcon} title="Widget" />
      <div className="page-body page-body--narrow">
        {projects.isPending ? (
          <SkeletonRows rows={3} />
        ) : !list.length ? (
          <div className="list">
            <EmptyState icon={WidgetIcon} title="Create a project first" action={<ButtonLink to="/projects?new=1">New project</ButtonLink>}>
              Each project has its own widget, with its own look, questions and behaviour.
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-3 mb-3">Each project has its own widget. Choose one to design.</p>
            <div className="list">
              {list.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}/widget`} className="list-row">
                  <WidgetIcon size={15} className="text-text-3" />
                  <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-text-3">{p.lastReportAt ? `Last report ${relativeTime(p.lastReportAt)}` : "No reports yet"}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
