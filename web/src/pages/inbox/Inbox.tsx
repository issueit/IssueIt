import { useProjects } from "../../lib/queries";
import { ButtonLink } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/feedback";
import { PageHeader } from "../../components/ui/layout";
import { InboxIcon } from "../../components/ui/icons";
import { ReportList } from "../../features/reports/ReportList";
import { ReportsSplit } from "../../features/reports/ReportsSplit";

export function InboxPage() {
  const projects = useProjects();
  const firstProject = projects.data?.projects[0];
  const noReportsYet = projects.data && projects.data.projects.every((p) => p.reportCount === 0);

  return (
    <div className="h-full lg:h-[calc(100%)] flex flex-col">
      <ReportsSplit basePath="/inbox" header={<PageHeader icon={InboxIcon} title="Inbox" />}>
        <ReportList
          basePath="/inbox"
          empty={
            noReportsYet ? (
              <EmptyState
                icon={InboxIcon}
                title="No reports yet"
                action={
                  firstProject ? (
                    <ButtonLink to={`/projects/${firstProject.id}`} variant="primary">
                      Set up {firstProject.name}
                    </ButtonLink>
                  ) : (
                    <ButtonLink to="/projects?new=1" variant="primary">
                      Create a project
                    </ButtonLink>
                  )
                }
              >
                {firstProject
                  ? "Add the widget to your site, share the hosted form or send a report with the API. It will show up here."
                  : "Create a project to get a widget, a hosted form and an API endpoint for collecting reports."}
              </EmptyState>
            ) : undefined
          }
        />
      </ReportsSplit>
    </div>
  );
}
