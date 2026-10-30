import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandIcon } from "../../components/ui/BrandIcon";
import { categoryLabels, useCatalogue } from "../../features/integrations/categories";
import type { ProviderCategory } from "../../lib/types";

/**
 * Every live integration, read from the server so the wall never drifts from
 * what the dashboard offers. Each one is named rather than left as a bare
 * icon: only about half the catalogue has a brand mark, and a wall of
 * repeated fallback glyphs says less than a wall of names. A slow sweep of
 * light crosses it; choosing a kind of service lights just those. The sweep
 * only runs while the wall is on screen, and only ever changes opacity.
 */
export function IntegrationWall() {
  const catalogue = useCatalogue();
  const [focus, setFocus] = useState<ProviderCategory | null>(null);
  const [live, setLive] = useState(false);
  const grid = useRef<HTMLUListElement>(null);
  const all = catalogue.data ?? [];

  useEffect(() => {
    const el = grid.current;
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
      <ul ref={grid} className="wall-grid" data-focus={focus ?? undefined} data-live={live || undefined}>
        {all.map((p, i) => (
          <li key={p.id} className="wall-chip" data-kind={p.category} title={p.summary} style={{ "--i": i } as CSSProperties} data-lit={focus === p.category || undefined}>
            <BrandIcon provider={p.id} name={p.name} size={14} fallback="monogram" />
            <span>{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
