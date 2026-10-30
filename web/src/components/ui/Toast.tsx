import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./Button";
import { CheckCircleIcon, CloseIcon, DangerCircleIcon } from "./icons";
import { announce } from "./announce";

type Toast = { id: number; text: string; tone: "default" | "danger"; action?: { label: string; run: () => void } };

let nextId = 1;
let listener: ((t: Toast) => void) | null = null;

/** Past tense, names the thing: "Copied project id", "Removed GitHub". */
export function toast(text: string, action?: Toast["action"]) {
  listener?.({ id: nextId++, text, tone: "default", action });
  announce(text);
}

/** For errors from somewhere else. Errors inside a flow belong in a Callout instead. */
export function toastError(text: string, retry?: () => void) {
  listener?.({ id: nextId++, text, tone: "danger", action: retry ? { label: "Try again", run: retry } : undefined });
  announce(text);
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    listener = (t) => {
      setToasts((list) => [...list.slice(-2), t]);
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.tone === "danger" ? 8000 : 4000);
    };
    return () => {
      listener = null;
    };
  }, []);
  const dismiss = (id: number) => setToasts((list) => list.filter((x) => x.id !== id));
  return createPortal(
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone} role="status">
          {t.tone === "danger" ? <DangerCircleIcon size={16} /> : <CheckCircleIcon size={16} className="text-text-3" />}
          <span className="toast__text">{t.text}</span>
          {t.action && (
            <Button
              size="sm"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </Button>
          )}
          <IconButton icon={CloseIcon} label="Dismiss" size="sm" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
