import type { ComponentType, CSSProperties, ReactNode } from "react";
import { CheckCircleIcon, DangerCircleIcon, DangerTriangleIcon, InfoCircleIcon } from "./icons";

export function Skeleton({ w, h = 12, className, style }: { w?: number | string; h?: number | string; className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className ?? ""}`} style={{ width: w ?? "100%", height: h, ...style }} aria-hidden />;
}

/** Rows shaped like a list that's loading. */
export function SkeletonRows({ rows = 5, withMeta = true }: { rows?: number; withMeta?: boolean }) {
  return (
    <div className="list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="list-row">
          <Skeleton w={14} h={14} className="rounded-full" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton w={`${45 + ((i * 17) % 35)}%`} />
            {withMeta && <Skeleton w={`${20 + ((i * 11) % 20)}%`} h={9} />}
          </div>
          <Skeleton w={56} h={18} />
        </div>
      ))}
    </div>
  );
}

/** What would be here, and the button that puts something here. */
export function EmptyState({ icon: IconC, title, children, action }: { icon: ComponentType<{ size?: number }>; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <IconC size={18} />
      </div>
      <div className="empty__title">{title}</div>
      {children && <div className="empty__text">{children}</div>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

type Tone = "info" | "danger" | "warning" | "success";
const toneIcon: Record<Tone, ComponentType<{ size?: number }>> = {
  info: InfoCircleIcon,
  danger: DangerCircleIcon,
  warning: DangerTriangleIcon,
  success: CheckCircleIcon,
};

/** An outcome to read beside its cause. */
export function Callout({ tone = "info", title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const IconC = toneIcon[tone];
  return (
    <div className="callout" data-tone={tone} role={tone === "danger" ? "alert" : undefined}>
      <IconC size={15} />
      <div className="flex-1 min-w-0">
        {title && <div className="callout__title">{title}</div>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action && <div className="self-center">{action}</div>}
    </div>
  );
}

export type PillTone = "neutral" | "active" | "success" | "warning" | "danger" | "update";

/** State in words, with a dot. Colour is never the only signal. */
export function StatusPill({ tone = "neutral", children, plain, title }: { tone?: PillTone; children: ReactNode; plain?: boolean; title?: string }) {
  return (
    <span className={`pill ${plain ? "pill--plain" : ""}`} data-tone={tone} title={title}>
      <span className="pill__dot" aria-hidden />
      {children}
    </span>
  );
}
