import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";
import { CloseIcon } from "./icons";

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A panel that slides in from the right for settings too long for a dialog.
 * Focus moves in and stays in; Escape closes; focus returns on close.
 */
export function Sheet({
  title,
  subtitle,
  icon,
  onClose,
  tabs,
  tab,
  onTab,
  footer,
  children,
  wide,
  locked,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  tabs?: Array<{ id: string; label: string }>;
  tab?: string;
  onTab?: (id: string) => void;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useRef(`sheet-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && ref.current) {
        const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
    // Only on open and close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={() => !locked && onClose()} />
      <div ref={ref} className={`sheet ${wide ? "sheet--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet__head">
          {icon}
          <div className="flex-1 min-w-0">
            <h2 className="sheet__title truncate" id={titleId}>
              {title}
            </h2>
            {subtitle && <div className="sheet__sub truncate">{subtitle}</div>}
          </div>
          <IconButton icon={CloseIcon} label="Close" onClick={onClose} disabled={locked} />
        </div>
        {tabs && (
          <div className="sheet__tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} onClick={() => onTab?.(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
