import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { MagnifierIcon } from "../../components/ui/icons";
import { docsHref } from "../../lib/hosts";
import { allPages, type DocPage } from "./nav";

/**
 * Documentation search. The index is the nav itself — title, section, summary
 * and the words a reader is likely to type that those don't contain — which
 * is small enough to search on every keystroke and can't fall out of step
 * with the pages that exist.
 */

type Hit = DocPage & { group: string; score: number };

function search(query: string): Hit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: Hit[] = [];
  for (const page of allPages) {
    const title = page.title.toLowerCase();
    const haystack = `${title} ${page.group.toLowerCase()} ${page.summary.toLowerCase()} ${page.keywords ?? ""} ${page.slug}`;
    let score = 0;
    for (const term of terms) {
      if (title === term) score += 60;
      else if (title.startsWith(term)) score += 30;
      else if (title.includes(term)) score += 20;
      else if (haystack.includes(term)) score += 6;
      else {
        score = -1;
        break;
      }
    }
    if (score > 0) hits.push({ ...page, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function SearchButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="dp-search-btn" onClick={onOpen}>
      <MagnifierIcon size={14} />
      <span>Search</span>
      <kbd>⌘K</kbd>
    </button>
  );
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const hits = useMemo(() => search(query), [query]);
  const fallback = useMemo(() => allPages.slice(0, 6), []);
  const list = query ? hits : fallback.map((p) => ({ ...p, score: 0 }));

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setAt(0), [query]);

  const go = (page: { slug: string }) => {
    navigate(docsHref(page.slug));
    onClose();
  };

  return (
    <div className="dp-search" role="dialog" aria-modal aria-label="Search the documentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dp-search-panel">
        <div className="dp-search-field">
          <MagnifierIcon size={15} />
          <input
            ref={input}
            value={query}
            placeholder="Search the documentation"
            aria-label="Search the documentation"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAt((i) => Math.min(i + 1, list.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && list[at]) {
                e.preventDefault();
                go(list[at]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        {list.length ? (
          <ul className="dp-search-list">
            {list.map((page, i) => (
              <li key={page.slug}>
                <button type="button" data-at={i === at || undefined} onMouseEnter={() => setAt(i)} onClick={() => go(page)}>
                  <span className="dp-search-group">{page.group}</span>
                  <strong>{page.title}</strong>
                  <span className="dp-search-summary">{page.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dp-search-empty">
            Nothing matches “{query}”. Try the name of a field, a header or an error code — or browse the sections on the left.
          </p>
        )}
      </div>
    </div>
  );
}

/** ⌘K anywhere in the documentation, and / when nothing else has focus. */
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? "");
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        open();
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
