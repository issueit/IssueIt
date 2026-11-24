import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useOrgEvents } from "../../lib/events";
import { useProjects } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import { setSidebar, setTheme, useAppearance } from "../../lib/theme";
import { DocsLink } from "../../lib/docs-link";
import { IconButton } from "../ui/Button";
import { prompt } from "../ui/Dialog";
import { Menu } from "../ui/Menu";
import { Tooltip } from "../ui/Tooltip";
import { toast, toastError } from "../ui/Toast";
import {
  AddIcon,
  AltArrowDownIcon,
  BookMinimalisticIcon,
  Chart2Icon,
  FolderWithFilesIcon,
  HamburgerMenuIcon,
  InboxIcon,
  Logout2Icon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  PlugCircleIcon,
  SettingsIcon,
  SidebarMinimalisticIcon,
  SunIcon,
  UserCircleIcon,
  WidgetIcon,
} from "../ui/icons";
import { Logo } from "./Logo";

export function Shell() {
  const { orgId } = useOrg();
  useOrgEvents(orgId);
  const [open, setOpen] = useState(false);
  const { sidebar } = useAppearance();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    // The rail state lives on the frame, so the sidebar and the main column can
    // both answer to it in CSS alone.
    <div className="app-frame" data-rail={sidebar === "collapsed" || undefined} data-open={open || undefined}>
      <aside className="sidebar">
        <Sidebar collapsed={sidebar === "collapsed"} />
      </aside>
      {open && <div className="sidebar-backdrop md:hidden" onClick={() => setOpen(false)} />}
      <main className="flex-1 min-w-0 h-full overflow-y-auto" id="main">
        <div className="md:hidden flex items-center gap-2 h-11 px-3 border-b border-border-subtle">
          <IconButton icon={HamburgerMenuIcon} label="Open navigation" onClick={() => setOpen(true)} />
          <Logo />
        </div>
        <Outlet />
      </main>
    </div>
  );
}

/** A nav row: icon, label, and either a count or a warning dot. Collapsed, the label becomes its tooltip. */
function NavItem({
  to,
  label,
  icon: IconC,
  count,
  alert,
  collapsed,
  external,
}: {
  to?: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  count?: number;
  alert?: boolean;
  collapsed: boolean;
  external?: boolean;
}) {
  const body = (
    <>
      <IconC size={20} />
      <span className="nav-item__label">{label}</span>
      {count ? (
        <span className="nav-item__count tabular" aria-label={`${count} new`}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      {alert && <span className="nav-item__alert" role="img" aria-label="A destination is failing" />}
    </>
  );
  const row = external ? (
    <DocsLink target="_blank" className="nav-item">
      {body}
    </DocsLink>
  ) : (
    <NavLink to={to!} className="nav-item">
      {body}
    </NavLink>
  );
  if (!collapsed) return row;
  return (
    <Tooltip label={label} side="right" hint={count ? `${count} new` : undefined}>
      {row}
    </Tooltip>
  );
}

function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { me, org, setOrg } = useOrg();
  const projects = useProjects();
  const newReports = projects.data?.projects.reduce((n, p) => n + p.newCount, 0) ?? 0;
  const failing = projects.data?.projects.reduce((n, p) => n + p.failingCount, 0) ?? 0;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { theme } = useAppearance();

  const newOrganisation = async () => {
    const name = await prompt({ title: "New organisation", label: "Name", placeholder: "Acme", confirmLabel: "Create organisation" });
    if (!name) return;
    try {
      const { id } = await api<{ id: string }>("/orgs", { body: { name } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      setOrg(id);
      navigate("/dashboard");
      toast(`Created ${name}`);
    } catch (err) {
      toastError(describeError(err, "Couldn't create the organisation."));
    }
  };

  const signOut = async () => {
    await api("/auth/logout", { body: {} }).catch(() => {});
    qc.clear();
    navigate("/login");
  };

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: Chart2Icon },
    { to: "/inbox", label: "Inbox", icon: InboxIcon, count: newReports },
    { to: "/projects", label: "Projects", icon: FolderWithFilesIcon },
    { to: "/integrations", label: "Integrations", icon: PlugCircleIcon, alert: failing > 0 },
    { to: "/widget", label: "Widget", icon: WidgetIcon },
  ];

  return (
    <>
      <div className="sidebar__top">
        <Menu
          align="start"
          trigger={
            <button type="button" className="org-switch" aria-label={`Organisation: ${org.name}`}>
              <span className="org-switch__mark">{org.name.charAt(0).toUpperCase()}</span>
              <span className="org-switch__name">{org.name}</span>
              <AltArrowDownIcon size={14} className="text-text-3 shrink-0" />
            </button>
          }
          items={[
            { heading: "Organisations" },
            ...me.organisations.map((o) => ({ label: o.name, checked: o.id === org.id, onSelect: () => setOrg(o.id) })),
            "separator" as const,
            { label: "New organisation…", icon: AddIcon, onSelect: newOrganisation },
          ]}
        />
        <IconButton
          size="sm"
          side="right"
          icon={SidebarMinimalisticIcon}
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar__collapse"
          onClick={() => setSidebar(collapsed ? "expanded" : "collapsed")}
        />
      </div>

      <nav className="sidebar__nav" aria-label="Main">
        {nav.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="sidebar__foot">
        <NavItem label="Documentation" icon={BookMinimalisticIcon} collapsed={collapsed} external />
        <NavItem to="/settings" label="Settings" icon={SettingsIcon} collapsed={collapsed} />
      </div>

      <div className="sidebar__me">
        <Menu
          align="start"
          trigger={
            <button type="button" className="me-switch" aria-label={`Account: ${me.user.name}`}>
              <span className="me-switch__mark">{me.user.name.charAt(0).toUpperCase()}</span>
              <span className="me-switch__text">
                <span className="me-switch__name">{me.user.name}</span>
                <span className="me-switch__email">{me.user.email}</span>
              </span>
            </button>
          }
          items={[
            { label: "Account settings", icon: UserCircleIcon, onSelect: () => navigate("/settings/account") },
            { label: "Appearance", icon: PaletteIcon, onSelect: () => navigate("/settings/appearance") },
            "separator",
            { heading: "Theme" },
            { label: "System", icon: MonitorIcon, checked: theme === "system", onSelect: () => setTheme("system") },
            { label: "Light", icon: SunIcon, checked: theme === "light", onSelect: () => setTheme("light") },
            { label: "Dark", icon: MoonIcon, checked: theme === "dark", onSelect: () => setTheme("dark") },
            "separator",
            { label: "Sign out", icon: Logout2Icon, onSelect: signOut },
          ]}
        />
      </div>
    </>
  );
}
