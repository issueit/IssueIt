import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { BoltIcon, KeyMinimalistic2Icon, RefreshIcon, Routing2Icon, ServerIcon, ShieldCheckIcon } from "../../../components/ui/icons";
import { useInView, useReducedMotion } from "../motion";

/**
 * A keyboard where some of the keys are features. The ordinary keys fade
 * into the background; a letter on the board presses when you press it,
 * and every so often a key presses by itself.
 */

type Feature = { icon: ComponentType<{ size?: number }>; title: string; text: string };
type Key = { id: string; w?: number; top?: string; label?: string; feature?: Feature; glyph?: string };

const F = {
  live: { icon: BoltIcon, title: "Minutes.", text: "One script tag, and reports start arriving." },
  keys: { icon: Routing2Icon, title: "Anywhere.", text: "135 destinations, or your own webhook." },
  signed: { icon: ShieldCheckIcon, title: "Signed.", text: "Every webhook carries an HMAC you can check." },
  keys2: { icon: KeyMinimalistic2Icon, title: "Careful.", text: "Secret keys are refused from a browser." },
  yours: { icon: ServerIcon, title: "Yours.", text: "One container and Postgres, on your own server." },
  team: { icon: RefreshIcon, title: "Reliable.", text: "Stored first, then retried for ten hours." },
} satisfies Record<string, Feature>;

const ROWS: Key[][] = [
  [{ id: "esc", label: "esc", w: 1.4 }, { id: "f1", label: "F1" }, { id: "f2", label: "F2" }, { id: "f3", label: "F3" }, { id: "f4", label: "F4" }, { id: "f5", label: "F5" }, { id: "f6", label: "F6" }, { id: "f7", label: "F7" }],
  [
    { id: "§", label: "§", top: "±" },
    { id: "1", label: "1", top: "!" },
    { id: "2", label: "2", top: "@" },
    { id: "3", label: "3", top: "#" },
    { id: "4", label: "4", top: "$" },
    { id: "5", label: "5", top: "%" },
    { id: "6", label: "6", top: "^" },
    { id: "7", label: "7", top: "&" },
    { id: "8", label: "8", top: "*" },
  ],
  [
    { id: "tab", glyph: "⇥", w: 1.5 },
    { id: "f-live", w: 1.8, feature: F.live },
    { id: "f-keys", w: 1.8, feature: F.keys },
    { id: "e", label: "E" },
    { id: "r", label: "R" },
    { id: "t", label: "T" },
    { id: "y", label: "Y" },
    { id: "u", label: "U" },
  ],
  [
    { id: "caps", glyph: "⇪", w: 1.8 },
    { id: "f-yours", w: 2.2, feature: F.yours },
    { id: "f-signed", w: 1.8, feature: F.signed },
    { id: "j", label: "J" },
    { id: "k", label: "K" },
    { id: "l", label: "L" },
    { id: ";", label: ";" },
  ],
  [
    { id: "shift", glyph: "⇧", w: 2.3 },
    { id: "f-team", w: 1.8, feature: F.team },
    { id: "f-keys2", w: 1.8, feature: F.keys2 },
    { id: "m", label: "M" },
    { id: "x", label: "X" },
    { id: "c", label: "C" },
  ],
  [{ id: "fn", label: "fn" }, { id: "ctrl", glyph: "⌃" }, { id: "alt", glyph: "⌥" }, { id: "cmd", glyph: "⌘", w: 1.4 }, { id: "space", w: 5 }],
];

const IDLE = ROWS.flat().filter((k) => !k.feature && k.id !== "space").map((k) => k.id);
const LETTERS = new Set(IDLE.filter((id) => /^[a-z0-9]$/.test(id)));

export function Keys() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const visible = useInView(ref, { margin: "0px" });
  const [down, setDown] = useState<Set<string>>(new Set());

  const press = (id: string, ms = 170) => {
    setDown((d) => new Set(d).add(id));
    window.setTimeout(
      () =>
        setDown((d) => {
          const n = new Set(d);
          n.delete(id);
          return n;
        }),
      ms,
    );
  };

  // Letters on the board press when you press them, while it's on screen.
  useEffect(() => {
    if (!visible) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (LETTERS.has(k)) press(k, 220);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [visible]);

  // Now and then a key presses itself.
  useEffect(() => {
    if (!visible || reduced) return;
    let t = 0;
    const tick = () => {
      press(IDLE[Math.floor(Math.random() * IDLE.length)]);
      t = window.setTimeout(tick, 650 + Math.random() * 900);
    };
    t = window.setTimeout(tick, 800);
    return () => clearTimeout(t);
  }, [visible, reduced]);

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div ref={ref} className="kb" onPointerMove={onMove}>
      <div className="kb-board">
        {ROWS.map((row, r) => (
          <div key={r} className="kb-row" data-fn={r === 0 || undefined}>
            {row.map((k) => (
              <div
                key={k.id}
                className="kb-key"
                data-feature={k.feature ? "" : undefined}
                data-down={down.has(k.id) || undefined}
                style={{ "--w": k.w ?? 1 } as CSSProperties}
                aria-hidden={!k.feature}
              >
                {k.feature ? (
                  <>
                    <k.feature.icon size={20} />
                    <p>
                      <b>{k.feature.title}</b> {k.feature.text}
                    </p>
                  </>
                ) : k.glyph ? (
                  <span className="kb-glyph">{k.glyph}</span>
                ) : (
                  <>
                    {k.top && <span className="kb-top">{k.top}</span>}
                    {k.label && <span className="kb-label">{k.label}</span>}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
