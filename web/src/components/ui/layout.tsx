import type { ComponentType, ReactNode } from "react";
import { NavLink } from "react-router";

/** A page: a 46px header (icon, title, actions on the right) and its body. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}

export function PageHeader({
  icon: IconC,
  title,
  crumbs,
  actions,
  tabs,
}: {
  icon?: ComponentType<{ size?: number }>;
  title: ReactNode;
  crumbs?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="page-header">
      <h1 className="page-header__title">
        {IconC && <IconC size={16} />}
        {crumbs}
        <span className="truncate">{title}</span>
      </h1>
      {tabs}
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Tabs({ items }: { items: Array<{ to: string; label: string; end?: boolean; badge?: ReactNode }> }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="tab">
          {t.label}
          {t.badge}
        </NavLink>
      ))}
    </nav>
  );
}

/** A group of settings rows with a title. */
export function SetGroup({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className ?? "mb-5"}>
      {title && <h2 className="set-group__title">{title}</h2>}
      <div className="set-group">{children}</div>
    </section>
  );
}

/** Label (what it is), hint (what it does or where it stands), one control on the right. */
export function SetRow({ label, hint, children, id }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="set-row" id={id}>
      <div className="set-row__text">
        <div className="set-row__label">{label}</div>
        {hint && <div className="set-row__hint">{hint}</div>}
      </div>
      {children && <div className="set-row__control">{children}</div>}
    </div>
  );
}
