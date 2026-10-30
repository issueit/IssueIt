import { ReportList } from "../../features/reports/ReportList";
import { ReportsSplit } from "../../features/reports/ReportsSplit";
import { useProjectContext } from "./ProjectLayout";

export function ProjectReports() {
  const { project } = useProjectContext();
  const base = `/projects/${project.id}/reports`;
  return (
    <ReportsSplit basePath={base}>
      <ReportList project={project.id} basePath={base} />
    </ReportsSplit>
  );
}
