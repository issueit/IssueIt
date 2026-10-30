import { StatusPill, type PillTone } from "../ui/feedback";
import type { DeliveryStatus, Priority, ReportStatus } from "../../lib/types";

export const statusLabels: Record<ReportStatus, string> = { new: "New", investigating: "Investigating", resolved: "Resolved", closed: "Closed" };
const statusTones: Record<ReportStatus, PillTone> = { new: "update", investigating: "warning", resolved: "success", closed: "neutral" };

export function ReportStatusPill({ status, plain }: { status: ReportStatus; plain?: boolean }) {
  return (
    <StatusPill tone={statusTones[status]} plain={plain}>
      {statusLabels[status]}
    </StatusPill>
  );
}

export const priorityLabels: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/** Priority as bars plus a word; only critical takes a signal colour. */
export function PriorityLabel({ priority, showText = true }: { priority: Priority; showText?: boolean }) {
  const level = { low: 1, medium: 2, high: 3, critical: 3 }[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-2" title={`${priorityLabels[priority]} priority`}>
      <span className="inline-flex items-end gap-[2px] h-3" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="w-[3px] rounded-[1px]"
            style={{
              height: 4 + n * 2.5,
              background: n <= level ? (priority === "critical" ? "var(--danger)" : "var(--text-2)") : "var(--border-strong)",
            }}
          />
        ))}
      </span>
      {showText ? <span className={priority === "critical" ? "text-danger font-medium" : ""}>{priorityLabels[priority]}</span> : <span className="sr-only">{priorityLabels[priority]}</span>}
    </span>
  );
}

const deliveryText: Record<DeliveryStatus, [string, PillTone]> = {
  pending: ["Queued", "neutral"],
  delivering: ["Sending", "update"],
  delivered: ["Delivered", "success"],
  retrying: ["Retrying", "warning"],
  failed: ["Failed", "danger"],
};

export function DeliveryPill({ status, plain }: { status: DeliveryStatus; plain?: boolean }) {
  const [label, tone] = deliveryText[status];
  return (
    <StatusPill tone={tone} plain={plain}>
      {label}
    </StatusPill>
  );
}

export const sourceLabel = (source: string) =>
  ({ widget: "Widget", form: "Hosted form", api: "API", test: "Test" })[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
