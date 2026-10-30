import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckIcon } from "./icons";

export type MenuItem =
  | {
      label: ReactNode;
      icon?: ComponentType<{ size?: number }>;
      onSelect: () => void;
      danger?: boolean;
      checked?: boolean;
      disabled?: boolean;
    }
  | "separator"
  | { heading: string };

/**
 * A dropdown anchored to its trigger. Arrow keys move, Enter selects,
 * Escape closes and returns focus. Destructive items go last.
 */
export function Menu({ trigger, items, align = "end" }: { trigger: ReactElement<any>; items: MenuItem[]; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let left = align === "end" ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    setPos({ top, left });
    menuRef.current.querySelector<HTMLElement>(".menu__item:not(:disabled)")?.focus();
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(".menu__item:not(:disabled)") ?? []);
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      {cloneElement(trigger, {
        ref: (el: HTMLElement) => {
          triggerRef.current = el;
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        },
      })}
      {open &&
        createPortal(
          <div ref={menuRef} role="menu" className="menu" style={pos} onKeyDown={onKeyDown}>
            {items.map((item, i) => {
              if (item === "separator") return <div key={i} className="menu__sep" role="separator" />;
              if ("heading" in item)
                return (
                  <div key={i} className="menu__label">
                    {item.heading}
                  </div>
                );
              const IconC = item.icon;
              return (
                <button
                  key={i}
                  type="button"
                  role={item.checked !== undefined ? "menuitemradio" : "menuitem"}
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  className={`menu__item ${item.danger ? "menu__item--danger" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    triggerRef.current?.focus();
                    item.onSelect();
                  }}
                >
                  {IconC && <IconC size={14} />}
                  <span className="truncate">{item.label}</span>
                  {item.checked && <CheckIcon size={14} className="menu__check" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
