import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * One tooltip for the whole app, drawn by us rather than by the browser, so it
 * follows the theme, can carry a second line and a shortcut, and flips when it
 * would fall off the screen. Two ways in:
 *
 *   <Tooltip label="Hide card">        a single element that needs one
 *   <TipGroup>                          many small things, each with data-tip
 *
 * The group form matters for grids: the heatmap has 168 cells, and one
 * delegated listener costs far less than 168 components with state.
 */

export type TipSide = "top" | "bottom" | "left" | "right";

type Tip = { label: ReactNode; hint?: ReactNode; keys?: string; side: TipSide; anchor: HTMLElement };

const BUBBLE_ID = "tip-bubble";
/** Space between the anchor and the bubble, enough for the arrow. */
const GAP = 8;
const DELAY = 340;
/** Once one tooltip has been read, its neighbours open at once. */
const GRACE = 320;

let publish: ((t: Tip | null) => void) | null = null;
let timer: number | undefined;
let closedAt = 0;
let anchored: HTMLElement | null = null;

function render(tip: Tip | null) {
  // The anchor, not the bubble, is what a screen reader is on.
  if (anchored) anchored.removeAttribute("aria-describedby");
  anchored = tip?.anchor ?? null;
  if (anchored) anchored.setAttribute("aria-describedby", BUBBLE_ID);
  publish?.(tip);
}

export function showTip(tip: Tip) {
  window.clearTimeout(timer);
  const wait = Date.now() - closedAt < GRACE ? 0 : DELAY;
  if (wait === 0) return render(tip);
  timer = window.setTimeout(() => render(tip), wait);
}

export function hideTip() {
  window.clearTimeout(timer);
  if (anchored) closedAt = Date.now();
  render(null);
}

/** Where the bubble goes: the asked-for side if it fits, the opposite if not. */
function place(anchor: DOMRect, bubble: DOMRect, side: TipSide) {
  const room = {
    top: anchor.top,
    bottom: window.innerHeight - anchor.bottom,
    left: anchor.left,
    right: window.innerWidth - anchor.right,
  };
  const need = side === "top" || side === "bottom" ? bubble.height + GAP : bubble.width + GAP;
  const opposite: Record<TipSide, TipSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const chosen = room[side] < need && room[opposite[side]] >= need ? opposite[side] : side;
  const clamp = (v: number, max: number, size: number) => Math.max(8, Math.min(v, max - size - 8));

  // The arrow keeps pointing at the middle of the anchor even once the bubble
  // has been pushed sideways to stay on screen.
  const arrow = (start: number, size: number, centre: number) => Math.max(10, Math.min(centre - start, size - 10));

  if (chosen === "top" || chosen === "bottom") {
    const left = clamp(anchor.left + anchor.width / 2 - bubble.width / 2, window.innerWidth, bubble.width);
    return {
      side: chosen,
      left,
      top: chosen === "top" ? anchor.top - bubble.height - GAP : anchor.bottom + GAP,
      arrow: arrow(left, bubble.width, anchor.left + anchor.width / 2),
    };
  }
  const top = clamp(anchor.top + anchor.height / 2 - bubble.height / 2, window.innerHeight, bubble.height);
  return {
    side: chosen,
    left: chosen === "left" ? anchor.left - bubble.width - GAP : anchor.right + GAP,
    top,
    arrow: arrow(top, bubble.height, anchor.top + anchor.height / 2),
  };
}

/** Mounted once, beside the toast and dialog hosts. */
export function TipHost() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ side: TipSide; left: number; top: number; arrow: number } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    publish = (t) => {
      setPos(null);
      setTip(t);
    };
    return () => {
      publish = null;
    };
  }, []);

  // Measure first, then place: the bubble's size decides whether it flips.
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return;
    setPos(place(tip.anchor.getBoundingClientRect(), bubble.current.getBoundingClientRect(), tip.side));
  }, [tip]);

  useEffect(() => {
    if (!tip) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hideTip();
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("resize", hideTip);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hideTip, true);
      window.removeEventListener("resize", hideTip);
      window.removeEventListener("keydown", onKey);
    };
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={bubble}
      id={BUBBLE_ID}
      role="tooltip"
      className="tip"
      data-side={pos?.side ?? tip.side}
      style={pos ? { left: pos.left, top: pos.top, ["--tip-arrow" as string]: `${pos.arrow}px` } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <span className="tip__label">
        {tip.label}
        {tip.keys && <kbd className="tip__keys">{tip.keys}</kbd>}
      </span>
      {tip.hint && <span className="tip__hint">{tip.hint}</span>}
    </div>,
    document.body,
  );
}

type TooltipProps = {
  label: ReactNode;
  /** A second, quieter line: what the thing does, or where it stands. */
  hint?: ReactNode;
  /** A keyboard shortcut, shown as a key cap. */
  keys?: string;
  side?: TipSide;
  children: ReactElement<any>;
};

/** Shows on hover and on keyboard focus; never on a touch tap, which has no hover. */
export function Tooltip({ label, hint, keys, side = "bottom", children }: TooltipProps) {
  const open = (el: HTMLElement) => showTip({ label, hint, keys, side, anchor: el });
  return cloneElement(children, {
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== "touch") open(e.currentTarget);
      children.props.onPointerEnter?.(e);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      hideTip();
      children.props.onPointerLeave?.(e);
    },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      hideTip();
      children.props.onPointerDown?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(":focus-visible")) open(e.currentTarget);
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hideTip();
      children.props.onBlur?.(e);
    },
  });
}

/**
 * Tooltips for everything inside with a `data-tip` attribute, from one pair of
 * listeners. `data-tip-hint` adds the second line.
 */
export function TipGroup({ side = "top", children, ...rest }: { side?: TipSide; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const target = (e: React.PointerEvent | React.FocusEvent) => (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
  return (
    <div
      {...rest}
      onPointerOver={(e) => {
        if (e.pointerType === "touch") return;
        const el = target(e);
        if (el) showTip({ label: el.dataset.tip ?? "", hint: el.dataset.tipHint, side, anchor: el });
        else hideTip();
      }}
      onPointerLeave={hideTip}
      onPointerDown={hideTip}
    >
      {children}
    </div>
  );
}
