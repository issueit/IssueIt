import type { ReactNode } from "react";
import { CopyButton } from "../../components/ui/Copy";
import { AltArrowDownIcon, DangerTriangleIcon, InfoCircleIcon, MagicWandIcon } from "../../components/ui/icons";
import { DocsLink } from "../../lib/docs-link";

/**
 * What a support article is made of. Deliberately plainer than the
 * documentation's kit: numbered steps, the path through the interface in
 * bold, a table when there's a choice to make, and a note when there's
 * something that will otherwise catch somebody out.
 */

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function H2({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slug(children);
  return (
    <h2 id={anchor} className="kb-h2">
      {children}
    </h2>
  );
}

export function H3({ children, id }: { children: string; id?: string }) {
  const anchor = id ?? slug(children);
  return (
    <h3 id={anchor} className="kb-h3">
      {children}
    </h3>
  );
}

/** A path through the interface: Settings → Notifications → Digest. */
export function UI({ children }: { children: ReactNode }) {
  return <strong className="kb-ui">{children}</strong>;
}

export const C = ({ children }: { children: ReactNode }) => <code className="kb-code">{children}</code>;

/** A link into the developer documentation, by its slug there. */
export function Doc({ to, children }: { to: string; children: ReactNode }) {
  return (
    <DocsLink to={to} className="kb-doc-link">
      {children}
    </DocsLink>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="kb-steps">{children}</ol>;
}

export function Step({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

const noteIcons = { note: InfoCircleIcon, important: DangerTriangleIcon, tip: MagicWandIcon };
const noteLabels = { note: "Note", important: "Important", tip: "Tip" };

export function Note({ kind = "note", children }: { kind?: "note" | "important" | "tip"; children: ReactNode }) {
  const Icon = noteIcons[kind];
  return (
    <aside className="kb-note" data-kind={kind}>
      <p className="kb-note-label">
        <Icon size={14} />
        {noteLabels[kind]}
      </p>
      <div>{children}</div>
    </aside>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReadonlyArray<ReadonlyArray<ReactNode>> }) {
  return (
    <div className="kb-table">
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

/** Detail most readers can skip, open to the one who can't. */
export function More({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="kb-more">
      <summary>
        <AltArrowDownIcon size={13} />
        {title}
      </summary>
      <div>{children}</div>
    </details>
  );
}

export function Code({ code, title }: { code: string; title?: string }) {
  return (
    <figure className="kb-block">
      <div className="kb-block-bar">
        <span>{title ?? "Copy this"}</span>
        <CopyButton text={code} what={title ? title.toLowerCase() : "text"} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

/** The symptoms-cause-resolution shape, for an article about something going wrong. */
export function Symptom({ children }: { children: ReactNode }) {
  return <div className="kb-symptom">{children}</div>;
}
