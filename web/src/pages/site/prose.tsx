import { useEffect, useState, type ReactNode } from "react";
import { CodeBlock } from "../../components/ui/Copy";

/** Building blocks for long-form public pages: legal text, the platform reference, blog posts. */

export type Toc = ReadonlyArray<readonly [id: string, label: string]>;

/** Long text beside a table of contents that follows the reader. */
export function Article({ toc, children, meta }: { toc?: Toc; children: ReactNode; meta?: ReactNode }) {
  const active = useActiveSection(toc);
  return (
    <div className="article site-wrap" data-toc={toc ? "" : undefined}>
      {toc && (
        <nav className="article-toc" aria-label="On this page">
          {meta}
          <ol>
            {toc.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} aria-current={active === id ? "location" : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="prose">{children}</div>
    </div>
  );
}

/** The last section whose heading has passed under the header. */
function useActiveSection(toc?: Toc) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!toc) return;
    const els = toc.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = els[0]?.id ?? null;
      for (const el of els) {
        if (el.getBoundingClientRect().top > 140) break;
        current = el.id;
      }
      // At the very bottom, the last sections may never reach the top; count them as read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const last = [...els].reverse().find((el) => el.getBoundingClientRect().top < window.innerHeight);
        if (last) current = last.id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [toc]);
  return active;
}

export function Section({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="prose-sec">
      <h2>
        <a href={`#${id}`} className="prose-anchor" aria-hidden tabIndex={-1}>
          #
        </a>
        {title}
      </h2>
      {children}
    </section>
  );
}

export const C = ({ children }: { children: ReactNode }) => <code className="prose-code">{children}</code>;

export function Code({ code, what = "example" }: { code: string; what?: string }) {
  return (
    <div className="prose-block">
      <CodeBlock code={code} what={what} />
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReadonlyArray<ReadonlyArray<ReactNode>> }) {
  return (
    <div className="prose-table">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A short callout for something the reader shouldn't miss. */
export function Note({ children }: { children: ReactNode }) {
  return <aside className="prose-note">{children}</aside>;
}

/** The short version of a long document, as a grid of plain statements. */
export function Glance({ items }: { items: ReadonlyArray<readonly [title: string, body: ReactNode]> }) {
  return (
    <ul className="glance">
      {items.map(([title, body]) => (
        <li key={title}>
          <strong>{title}</strong>
          <span>{body}</span>
        </li>
      ))}
    </ul>
  );
}
