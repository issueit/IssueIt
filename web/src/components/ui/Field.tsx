import { cloneElement, forwardRef, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/** A label, the control, then a hint or an error. Wires up ids and aria for the child. */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactElement<any>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <span className="optional"> (optional)</span>}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": hint || error ? hintId : undefined,
      })}
      {error ? (
        <div className="field__error" id={hintId} role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="field__hint" id={hintId}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { size_?: "sm" }>(function Input({ className, size_, ...rest }, ref) {
  return <input ref={ref} className={`input ${size_ === "sm" ? "input--sm" : ""} ${className ?? ""}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={`textarea ${className ?? ""}`} {...rest} />;
});

type Option = { value: string; label: string };

export function Select({
  options,
  className,
  small,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; small?: boolean }) {
  return (
    <select className={`select ${small ? "select--sm" : ""} ${className ?? ""}`} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
