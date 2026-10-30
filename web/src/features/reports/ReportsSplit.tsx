import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { ReportPanel } from "./ReportPanel";

/**
 * A list with the selected report beside it. On narrow screens the panel
 * covers the list instead; closing returns to the list.
 */
export function ReportsSplit({ header, children, basePath }: { header?: ReactNode; children: ReactNode; basePath: string }) {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const close = () => navigate(basePath);
  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 overflow-y-auto">
        {header}
        <div className="page-body">{children}</div>
      </div>
      {reportId && (
        <div className="fixed inset-0 z-20 flex justify-end lg:static lg:z-auto" style={{ background: "var(--backdrop)" }} onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="h-full lg:h-auto lg:min-h-full w-full sm:w-auto flex">
            <ReportPanel key={reportId} id={reportId} onClose={close} />
          </div>
        </div>
      )}
    </div>
  );
}
