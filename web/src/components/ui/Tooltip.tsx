import { cloneElement, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

type Props = { label: string; children: ReactElement<any>; side?: "top" | "bottom" };

/** Shows on hover and keyboard focus after a short delay. */
export function Tooltip({ label, children, side = "bottom" }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();

  const show = (el: HTMLElement) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: side === "top" ? r.top - 6 : r.bottom + 6 });
    }, 350);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };

  const child = cloneElement(children, {
    "aria-describedby": pos ? id : undefined,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show(e.currentTarget);
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide();
      children.props.onBlur?.(e);
    },
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      children.props.onMouseDown?.(e);
    },
  });

  return (
    <>
      {child}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            className="tooltip"
            style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${side === "top" ? "-100%" : "0"})` }}
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
