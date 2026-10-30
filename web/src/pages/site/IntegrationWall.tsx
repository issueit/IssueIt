import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { categoryLabels, useCatalogue } from "../../features/integrations/categories";
import type { ProviderCategory } from "../../lib/types";

/**
 * Every live integration, read from the server so the wall never drifts from
 * what the dashboard offers. The cards float past in lanes running opposite
 * ways, full width of the screen, and a lane stops when you point at it.
 *
 * Each card is named rather than left as a bare mark: only about half the
 * catalogue has a brand mark, and a wall of repeated fallback glyphs says
 * less than a wall of names. The catalogue arrives grouped by category, so
 * the lanes are dealt round-robin to mix the kinds of service together.
 *
 * Only the four lanes animate, and only by transform, so this costs four
 * composited layers rather than a repaint of 135 cards.
 */

const LANES = 4;

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
      <div ref={rows} className="wall-rows" data-focus={focus ?? undefined} data-live={live || undefined}>
        {lanes.map((lane, i) => (
          <div key={i} className="wall-lane" data-reverse={i % 2 === 1 || undefined} style={{ "--dur": `${104 + i * 11}s` } as CSSProperties}>
            <div className="wall-track">
              {/* Two copies, so the lane can loop by sliding exactly half its width. */}
              {[0, 1].map((copy) => (
                <div key={copy} className="wall-set" aria-hidden={copy === 1 || undefined}>
                  {lane.map((p) => (
                    <div key={p.id} className="wall-card" data-lit={focus === p.category || undefined} title={p.summary}>
                      <BrandIcon provider={p.id} name={p.name} size={26} fallback="monogram" />
                      <span>{p.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
