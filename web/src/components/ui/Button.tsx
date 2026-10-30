import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "default" | "primary" | "quiet" | "danger" | "danger-solid";
type Icon = ComponentType<{ size?: number | string; strokeWidth?: number | string }>;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: Icon;
  /** Shows a spinner and blocks clicks while work the person started is running. */
  busy?: boolean;
};

export function buttonClass(variant: ButtonVariant = "default", size: "md" | "sm" = "md", extra = "") {
  return ["btn", variant !== "default" && `btn--${variant}`, size === "sm" && "btn--sm", extra].filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", icon: IconC, busy, children, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <span className="spinner" aria-hidden /> : IconC ? <IconC size={size === "sm" ? 13 : 14} /> : null}
      {children}
    </button>
  );
});

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: Icon;
  /** Accessible name, also shown as the tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  busy?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: IconC, label, variant = "quiet", size = "md", busy, className, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={buttonClass(variant, size, `btn--icon ${className ?? ""}`)}
        disabled={disabled || busy}
        {...rest}
      >
        {busy ? <span className="spinner" aria-hidden /> : <IconC size={size === "sm" ? 14 : 16} />}
      </button>
    </Tooltip>
  );
});

export function ButtonLink({
  to,
  variant = "default",
  size = "md",
  icon: IconC,
  children,
  external,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: Icon;
  children: ReactNode;
  external?: boolean;
}) {
  const content = (
    <>
      {IconC && <IconC size={size === "sm" ? 13 : 14} />}
      {children}
    </>
  );
  if (external)
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size)}>
        {content}
      </a>
    );
  return (
    <Link to={to} className={buttonClass(variant, size)}>
      {content}
    </Link>
  );
}
