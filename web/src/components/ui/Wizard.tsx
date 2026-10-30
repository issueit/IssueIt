import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/**
 * A short sequence in a dialog: stepper on top, one step's body, and a
 * footer that reads Back · why-not · secondary · primary.
 */
export function Wizard({
  open,
  onClose,
  title,
  steps,
  current,
  children,
  onBack,
  primary,
  secondary,
  blocking,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  steps: string[];
  current: number;
  children: ReactNode;
  onBack?: () => void;
  primary: { label: string; onClick: () => void; disabled?: boolean; quiet?: boolean };
  secondary?: ReactNode;
  /** Why the primary button is disabled, in a sentence. */
  blocking?: string | null;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      locked={busy}
      header={
        <ol className="stepper" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s} className="contents">
              {i > 0 && <span className="stepper__sep" aria-hidden />}
              <span className="stepper__step" data-state={i === current ? "current" : i < current ? "done" : "todo"} aria-current={i === current ? "step" : undefined}>
                <span className="stepper__num">{i + 1}</span>
                {s}
              </span>
            </li>
          ))}
        </ol>
      }
      footer={
        <>
          {onBack && (
            <Button variant="quiet" onClick={onBack} disabled={busy}>
              Back
            </Button>
          )}
          <span className="dialog__footer-note" role={blocking ? "status" : undefined}>
            {primary.disabled && blocking}
          </span>
          {secondary}
          <Button variant={primary.quiet ? "default" : "primary"} onClick={primary.onClick} disabled={primary.disabled} busy={busy}>
            {primary.label}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
