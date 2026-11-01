import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type KeyboardEvent } from "react";
import { useInView, useReducedMotion } from "../motion";

/**
 * Tiles on an arc that turns, one stop at a time, and stops on each tile
 * long enough to name it. The tile in the middle is the one that is
 * chosen; click another to turn to it. Only transform and opacity move,
 * because animated filters crash WebKit.
 */

export type ArcItem = { id: string; label: string; icon: ComponentType<{ size?: number }> };

/** Where a tile `o` places from the middle sits, and how present it is. */
function place(o: number) {
  const a = Math.abs(o);
  const s = Math.sign(o);
  return {
    x: s * 132 * Math.pow(a, 0.74),
    y: 34 * Math.pow(a, 1.32),
    scale: Math.max(0.5, 1 - a * 0.13),
    opacity: a === 0 ? 1 : a === 1 ? 0.88 : a === 2 ? 0.55 : a === 3 ? 0.22 : 0,
  };
}

export function Arc({ items, active, onSelect, every = 2600, label = "Choose one" }: { items: ArcItem[]; active: number; onSelect: (i: number) => void; every?: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const visible = useInView(ref, { margin: "0px" });
  const [held, setHeld] = useState(false);
  const n = items.length;
  // The position the arc last settled on, to tell a turn from a wrap.
  const settled = useRef(active);
  useEffect(() => {
    settled.current = active;
  }, [active]);
  /** Places from the middle, the shortest way round so the arc never runs the long way. */
  const offset = (i: number, from: number) => {
    let o = (i - from) % n;
    if (o > n / 2) o -= n;
    if (o < -n / 2) o += n;
    return o;
  };

  // Turns by itself while on screen, unless the pointer or focus is on it.
  useEffect(() => {
    if (!visible || reduced || held) return;
    const t = window.setTimeout(() => onSelect((active + 1) % n), every);
    return () => clearTimeout(t);
  }, [visible, reduced, held, active, n, every, onSelect]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") onSelect((active + 1) % n);
    else if (e.key === "ArrowLeft") onSelect((active - 1 + n) % n);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      className="arc"
      role="listbox"
      aria-label={label}
      aria-activedescendant={`arc-${items[active].id}`}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="arc-stage">
        {items.map((item, i) => {
          const o = offset(i, active);
          // A tile that wraps from one end to the other jumps there unseen.
          const jump = Math.abs(offset(i, settled.current) - o) > n / 2;
          const p = place(o);
          return (
            <button
              key={item.id}
              id={`arc-${item.id}`}
              type="button"
              role="option"
              aria-selected={o === 0}
              tabIndex={-1}
              className="arc-item"
              data-mid={o === 0 || undefined}
              data-jump={jump || undefined}
              style={
                {
                  "--x": `${p.x.toFixed(1)}px`,
                  "--y": `${p.y.toFixed(1)}px`,
                  "--s": p.scale.toFixed(3),
                  opacity: p.opacity,
                  zIndex: 10 - Math.abs(o),
                  pointerEvents: p.opacity < 0.2 ? "none" : undefined,
                } as CSSProperties
              }
              onClick={() => onSelect(i)}
            >
              <span className="arc-tile">
                <item.icon size={30} />
              </span>
              <span className="sr-only">{item.label}</span>
            </button>
          );
        })}
        <p className="arc-label" key={items[active].id} aria-hidden>
          {items[active].label}
        </p>
      </div>
    </div>
  );
}
