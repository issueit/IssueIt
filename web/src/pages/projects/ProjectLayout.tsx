import { Link, Outlet, useOutletContext, useParams } from "react-router";
import { describeError } from "../../lib/api";
import { useProject } from "../../lib/queries";
import type { MailInfo, Project, ProjectLinks } from "../../lib/types";
import { Button, ButtonLink } from "../../components/ui/Button";
import { Callout, EmptyState, Skeleton } from "../../components/ui/feedback";
import { FolderWithFilesIcon } from "../../components/ui/icons";
import { PageHeader, Tabs } from "../../components/ui/layout";
import { ApiError } from "../../lib/api";

export type ProjectContext = { project: Project; links: ProjectLinks; stats: { total: number; open: number; week: number }; mail: MailInfo };

export const useProjectContext = () => useOutletContext<ProjectContext>();

/** Project pages share a header whose tabs move between the project's sections. */
export function ProjectLayout() {
  const { projectId = "" } = useParams();
  const query = useProject(projectId);
  const base = `/projects/${projectId}`;

  const crumbs = (
    <>
      <Link to="/projects" className="page-header__crumb">
        Projects
      </Link>
      <span className="text-text-4">/</span>
    </>
  );

  if (query.isError) {
    const missing = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
    return (
      <>
        <PageHeader icon={FolderWithFilesIcon} title="Project" crumbs={crumbs} />
        <div className="page-body">
          {missing ? (
            <div className="list">
              <EmptyState icon={FolderWithFilesIcon} title="Project not found" action={<ButtonLink to="/projects">Back to projects</ButtonLink>}>
                It may have been deleted, or it belongs to a different organisation.
              </EmptyState>
            </div>
          ) : (
            <Callout tone="danger" action={<Button size="sm" onClick={() => query.refetch()}>Try again</Button>}>
              {describeError(query.error, "Couldn't load the project.")}
            </Callout>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={FolderWithFilesIcon}
        crumbs={crumbs}
        title={query.data?.project.name ?? <Skeleton w={100} h={14} />}
        tabs={
          <Tabs
            items={[
              { to: base, label: "Overview", end: true },
              { to: `${base}/reports`, label: "Reports" },
              { to: `${base}/integrations`, label: "Integrations" },
              { to: `${base}/keys`, label: "API keys" },
              { to: `${base}/widget`, label: "Widget" },
              { to: `${base}/settings`, label: "Settings" },
            ]}
          />
        }
      />
      <div className="flex-1 min-h-0">
        {query.isPending ? (
          <div className="page-body flex flex-col gap-3">
            <Skeleton h={16} w={220} />
            <Skeleton h={80} />
            <Skeleton h={120} />
          </div>
        ) : (
          <Outlet context={query.data satisfies ProjectContext} />
        )}
      </div>
    </div>
  );
}
