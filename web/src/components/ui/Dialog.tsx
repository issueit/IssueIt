import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Input } from "./Field";
import { IconButton } from "./Button";
import { CloseIcon } from "./icons";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "narrow" | "default" | "wide";
  /** Blocks closing while something the person started is running. */
  locked?: boolean;
  /** Shown above the body, e.g. a wizard stepper. */
  header?: ReactNode;
  as?: "div" | "form";
  onSubmit?: () => void;
};

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Modal dialog: focus moves in and is trapped, Escape closes, focus returns on close. */
export function Dialog({ open, onClose, title, description, children, footer, width = "default", locked, header, as = "div", onSubmit }: DialogProps) {
  const ref = useRef<HTMLDivElement & HTMLFormElement>(null);
  const titleId = useRef(`dlg-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    requestAnimationFrame(() => {
      const auto = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(".dialog__body " + FOCUSABLE.split(",")[2]) ?? el?.querySelector<HTMLElement>(".btn--primary") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
      auto?.focus();
    });
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !locked) {
      e.stopPropagation();
      onClose();
    }
    if (e.key === "Tab" && ref.current) {
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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

  const Tag = as;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <Tag
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`dialog ${width === "wide" ? "dialog--wide" : width === "narrow" ? "dialog--narrow" : ""}`}
        onKeyDown={onKeyDown}
        onSubmit={
          as === "form"
            ? (e: React.FormEvent) => {
                e.preventDefault();
                onSubmit?.();
              }
            : undefined
        }
        noValidate={as === "form" ? true : undefined}
      >
        <div className="dialog__header">
          <div className="flex-1 min-w-0">
            <h2 className="dialog__title" id={titleId}>
              {title}
            </h2>
            {description && <p className="dialog__description">{description}</p>}
          </div>
          <IconButton icon={CloseIcon} label="Close" size="sm" onClick={onClose} disabled={locked} />
        </div>
        {header}
        {children && <div className="dialog__body">{children}</div>}
        {footer && <div className="dialog__footer">{footer}</div>}
      </Tag>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ confirm() and prompt() */

type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Require typing this exact text first, for the most destructive actions. */
  typeToConfirm?: string;
};

type PromptOptions = { title: string; message?: ReactNode; label: string; placeholder?: string; initial?: string; confirmLabel: string };

type Request =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (v: string | null) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (v: string | null) => void };

let push: ((r: Request) => void) | null = null;

/** Resolves to true only if the person confirmed. Focus starts on the safe answer. */
export function confirm(options: ConfirmOptions): Promise<string | null> {
  return new Promise((resolve) => push?.({ kind: "confirm", options, resolve }));
}

export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => push?.({ kind: "prompt", options, resolve }));
}

export function DialogHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    push = (r) => {
      setValue(r.kind === "prompt" ? (r.options.initial ?? "") : "");
      setRequest(r);
    };
    return () => {
      push = null;
    };
  }, []);
  if (!request) return null;
  const close = (result: string | null) => {
    request.resolve(result);
    setRequest(null);
  };

  if (request.kind === "prompt") {
    const o = request.options;
    return (
      <Dialog
        open
        as="form"
        onSubmit={() => value.trim() && close(value.trim())}
        onClose={() => close(null)}
        title={o.title}
        description={o.message}
        width="narrow"
        footer={
          <>
            <span className="mr-auto" />
            <Button onClick={() => close(null)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!value.trim()}>
              {o.confirmLabel}
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="field__label">{o.label}</span>
          <Input data-autofocus value={value} placeholder={o.placeholder} onChange={(e) => setValue(e.target.value)} maxLength={80} />
        </label>
      </Dialog>
    );
  }

  const o = request.options;
  const blocked = o.typeToConfirm !== undefined && value.trim() !== o.typeToConfirm;
  return (
    <Dialog
      open
      as="form"
      onSubmit={() => !blocked && close(value || "ok")}
      onClose={() => close(null)}
      title={o.title}
      width="narrow"
      footer={
        <>
          <span className="mr-auto" />
          <Button onClick={() => close(null)} data-autofocus={o.typeToConfirm ? undefined : true}>
            Cancel
          </Button>
          <Button type="submit" variant={o.danger ? "danger-solid" : "primary"} disabled={blocked}>
            {o.confirmLabel}
          </Button>
        </>
      }
    >
      {o.message && <div className="text-sm text-text-2">{o.message}</div>}
      {o.typeToConfirm !== undefined && (
        <label className="field">
          <span className="field__label">
            Type <span className="mono">{o.typeToConfirm}</span> to confirm
          </span>
          <Input data-autofocus value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </label>
      )}
    </Dialog>
  );
}
