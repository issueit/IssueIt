import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CopyButton } from "../../components/ui/Copy";
import { AltArrowRightIcon, DangerTriangleIcon, InfoCircleIcon, MagicWandIcon } from "../../components/ui/icons";
import { docsHref } from "../../lib/hosts";

/**
 * The parts every documentation page is built from. Headings carry ids and
 * nothing else does, because the contents list on the right is read back out
 * of the rendered page rather than declared twice.
 */

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function H2({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slug(children);
  return (
    <h2 id={anchor} className="dp-h2">
      <a href={`#${anchor}`} className="dp-anchor" aria-label={`Link to ${children}`}>
        #
      </a>
      {children}
    </h2>
  );
}

export function H3({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slug(children);
  return (
    <h3 id={anchor} className="dp-h3">
      <a href={`#${anchor}`} className="dp-anchor" aria-label={`Link to ${children}`}>
        #
      </a>
      {children}
    </h3>
  );
}

/** Inline code. Short enough to read inside a sentence; anything longer is a block. */
export const C = ({ children }: { children: ReactNode }) => <code className="dp-code">{children}</code>;

/** A link to another documentation page, by the slug it has in the nav. */
export function D({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={docsHref(to)}>{children}</Link>;
}

export function Code({ code, title, lang = "" }: { code: string; title?: string; lang?: string }) {
  return (
    <figure className="dp-block">
      <div className="dp-block-bar">
        <span className="dp-block-title">{title ?? lang ?? "Example"}</span>
        <CopyButton text={code} what={title ? title.toLowerCase() : "code"} />
      </div>
      <pre className="dp-pre" data-lang={lang || undefined}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

/** The same thing in several languages. The choice is remembered for the session. */
export function CodeTabs({ tabs }: { tabs: ReadonlyArray<{ label: string; code: string }> }) {
  const [active, setActive] = useState(() => remembered(tabs));
  const name = useId();
  const current = tabs.find((t) => t.label === active) ?? tabs[0];
  return (
    <figure className="dp-block">
      <div className="dp-block-bar">
        <div className="dp-tabs" role="tablist" aria-label="Language">
          {tabs.map((t) => (
            <button
              key={t.label}
              type="button"
              role="tab"
              id={`${name}-${slug(t.label)}`}
              aria-selected={t.label === current.label}
              className="dp-tab"
              onClick={() => {
                setActive(t.label);
                try {
                  sessionStorage.setItem(LANG_KEY, t.label);
                } catch {
                  // Private browsing. The choice just won't be remembered.
                }
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton text={current.code} what={`${current.label} example`} />
      </div>
      <pre className="dp-pre" role="tabpanel" aria-labelledby={`${name}-${slug(current.label)}`}>
        <code>{current.code}</code>
      </pre>
    </figure>
  );
}

const LANG_KEY = "issueit:docs-language";
function remembered(tabs: ReadonlyArray<{ label: string }>) {
  try {
    const saved = sessionStorage.getItem(LANG_KEY);
    if (saved && tabs.some((t) => t.label === saved)) return saved;
  } catch {
    // No storage; fall through to the first tab.
  }
  return tabs[0].label;
}

/** A request line, the way it appears in a terminal rather than a table. */
export function Endpoint({ method, path, auth }: { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path: string; auth?: string }) {
  return (
    <div className="dp-endpoint">
      <span className="dp-method" data-method={method.toLowerCase()}>
        {method}
      </span>
      <code>{path}</code>
      {auth && <span className="dp-endpoint-auth">{auth}</span>}
    </div>
  );
}

export type Param = { name: string; type?: string; required?: boolean; children: ReactNode };

/** Request or response fields: the name, what it holds, and whether it's needed. */
export function Params({ rows }: { rows: ReadonlyArray<Param> }) {
  return (
    <dl className="dp-params">
      {rows.map((r) => (
        <div key={r.name} className="dp-param">
          <dt>
            <code>{r.name}</code>
            {r.type && <span className="dp-param-type">{r.type}</span>}
            {r.required && <span className="dp-param-req">Required</span>}
          </dt>
          <dd>{r.children}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReadonlyArray<ReadonlyArray<ReactNode>> }) {
  return (
    <div className="dp-table">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              // Keyed by position: a column with no heading is legitimate, and
              // two of them would otherwise collide.
              <th key={i}>{h}</th>
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

const calloutIcons = { note: InfoCircleIcon, warning: DangerTriangleIcon, tip: MagicWandIcon };

export function Callout({ kind = "note", title, children }: { kind?: "note" | "warning" | "tip"; title?: string; children: ReactNode }) {
  const Icon = calloutIcons[kind];
  return (
    <aside className="dp-callout" data-kind={kind}>
      <Icon size={15} className="dp-callout-icon" />
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </aside>
  );
}

/** Numbered work, where each step is a thing you do rather than a thing to know. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="dp-steps">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <li className="dp-step">
      <h4>{title}</h4>
      {children}
    </li>
  );
}

/** Where to go next, or the sub-pages of a section. */
export function Cards({ items }: { items: ReadonlyArray<{ to: string; title: string; text: string }> }) {
  return (
    <div className="dp-cards">
      {items.map((it) => (
        <Link key={it.to} to={docsHref(it.to)} className="dp-card">
          <strong>
            {it.title}
            <AltArrowRightIcon size={13} />
          </strong>
          <span>{it.text}</span>
        </Link>
      ))}
    </div>
  );
}

/** Facts in two columns: shorter than a table and no header to read. */
export function Facts({ rows }: { rows: ReadonlyArray<readonly [ReactNode, ReactNode]> }) {
  return (
    <dl className="dp-facts">
      {rows.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
