import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { categoryLabels, useCatalogue } from "../../features/integrations/categories";
import type { ProviderCategory } from "../../lib/types";

/**
 * Every live integration, read from the server so the wall never drifts from
 * what the dashboard offers. The cards float past in four lanes running
 * opposite ways, filling the screen, and never stop under the pointer.
 *
 * Each card is named rather than left as a bare mark: only about half the
 * catalogue has a brand mark, and a wall of repeated fallback glyphs says
 * less than a wall of names. The catalogue arrives grouped by category, so
 * the lanes are dealt round-robin to mix the kinds of service together.
 *
 * Each card crosses its lane on its own staggered animation rather than
 * riding one long track. A track wide enough to hold a lane is a single
 * composited layer some 7,900px across, and at this card size WebKit
 * crashed on about one long scroll in four. Cards that cross on their own
 * are clipped by the lane, so nothing off screen is ever drawn.
 */

const LANES = 4;
/** Spacing between cards, as a percentage of a card's width. */
const PITCH = 106;

export function IntegrationWall() {
  const catalogue = useCatalogue();
  const [focus, setFocus] = useState<ProviderCategory | null>(null);
  const [live, setLive] = useState(false);
  const rows = useRef<HTMLDivElement>(null);
  const all = catalogue.data ?? [];

  useEffect(() => {
    const el = rows.current;
    if (!el) return;
    const watch = new IntersectionObserver(([entry]) => setLive(entry.isIntersecting));
    watch.observe(el);
    return () => watch.disconnect();
  }, [all.length]);

  if (!all.length) return null;
  const kinds = (Object.keys(categoryLabels) as ProviderCategory[])
    .map((c) => [c, all.filter((p) => p.category === c).length] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const shown = focus ? kinds.find(([c]) => c === focus)?.[1] : null;
  const lanes = Array.from({ length: LANES }, (_, lane) => all.filter((_, i) => i % LANES === lane));
  // One set of keyframes per lane length. The endpoints are percentages of a
  // card's own width, so they hold no variables: a var() inside an animated
  // calc() is re-resolved every frame and cost 130ms/s of style recalc.
  const counts = [...new Set(lanes.map((l) => l.length))];
  const keyframes = counts.map((n) => `@keyframes cross-${n}{from{transform:translateX(${(n - 1) * PITCH}%)}to{transform:translateX(-${PITCH}%)}}`).join("");

  return (
    <div className="wall" data-rv>
      <div className="wall-head">
        <p className="wall-count">
          <span className="tabular">{shown ?? all.length}</span>
          {focus ? ` ${categoryLabels[focus].plural.toLowerCase()}, ready to connect` : " destinations, all live today"}
        </p>
        <div className="wall-kinds" role="group" aria-label="Highlight a kind of service">
          {kinds.map(([c, n]) => (
            <button key={c} type="button" aria-pressed={focus === c} onClick={() => setFocus(focus === c ? null : c)} onMouseEnter={() => setFocus(c)} onMouseLeave={() => setFocus(null)}>
              {categoryLabels[c].plural}
              <span className="tabular">{n}</span>
            </button>
          ))}
        </div>
      </div>
      <style>{keyframes}</style>
      <div ref={rows} className="wall-rows" data-focus={focus ?? undefined} data-live={live || undefined}>
        {lanes.map((lane, i) => (
          <div key={i} className="wall-lane" data-reverse={i % 2 === 1 || undefined} style={{ "--dur": `${150 + i * 14}s`, "--count": lane.length } as CSSProperties}>
            {lane.map((p, slot) => (
              <div key={p.id} className="wall-card" data-lit={focus === p.category || undefined} title={p.summary} style={{ "--i": slot, animationName: `cross-${lane.length}` } as CSSProperties}>
                <BrandIcon provider={p.id} name={p.name} size="var(--wall-mark)" fallback="monogram" />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
