import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useOrgEvents } from "../../lib/events";
import { useProjects } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import { setTheme, useAppearance } from "../../lib/theme";
import { IconButton } from "../ui/Button";
import { prompt } from "../ui/Dialog";
import { Menu } from "../ui/Menu";
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
  SunIcon,
  UserCircleIcon,
  WidgetIcon,
} from "../ui/icons";
import { Logo } from "./Logo";

export function Shell() {
  const { orgId } = useOrg();
  useOrgEvents(orgId);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="flex h-full">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border-subtle bg-bg md:static md:translate-x-0 transition-transform ${open ? "translate-x-0 shadow-xl" : "-translate-x-full"}`}
        style={{ width: "var(--sidebar-w)", transitionDuration: "var(--t-panel)" }}
      >
        <Sidebar />
      </aside>
      {open && <div className="fixed inset-0 z-30 md:hidden" style={{ background: "var(--backdrop)" }} onClick={() => setOpen(false)} />}
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

function Sidebar() {
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
      <div className="px-2.5 pt-2.5 pb-1">
        <Menu
          align="start"
          trigger={
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 h-9 text-left hover:bg-hover transition-colors" aria-label={`Organisation: ${org.name}`}>
              <span className="grid place-items-center size-6 rounded-md bg-accent text-accent-fg text-xs font-semibold shrink-0">{org.name.charAt(0).toUpperCase()}</span>
              <span className="flex-1 min-w-0 truncate text-sm font-semibold">{org.name}</span>
              <AltArrowDownIcon size={13} className="text-text-3" />
            </button>
          }
          items={[
            { heading: "Organisations" },
            ...me.organisations.map((o) => ({ label: o.name, checked: o.id === org.id, onSelect: () => setOrg(o.id) })),
            "separator" as const,
            { label: "New organisation…", icon: AddIcon, onSelect: newOrganisation },
          ]}
        />
      </div>

      <nav className="flex flex-col gap-px px-2.5 py-2" aria-label="Main">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors ${isActive ? "bg-hover text-text" : "text-text-2 hover:bg-hover hover:text-text"}`
            }
            style={{ height: "var(--nav-item-h)" }}
          >
            <item.icon size={16} />
            <span className="flex-1">{item.label}</span>
            {item.count ? (
              <span className="tabular text-xs text-text-3" aria-label={`${item.count} new`}>
                {item.count}
              </span>
            ) : null}
            {item.alert && <span className="size-1.5 rounded-full bg-danger" role="img" aria-label="A destination is failing" />}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-px px-2.5 pb-1.5">
        <NavLink
          to="/docs"
          target="_blank"
          className="flex items-center gap-2.5 rounded-md px-2 text-sm font-medium text-text-2 hover:bg-hover hover:text-text transition-colors"
          style={{ height: "var(--nav-item-h)" }}
        >
          <BookMinimalisticIcon size={16} />
          <span className="flex-1">Documentation</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-2 text-sm font-medium transition-colors ${isActive ? "bg-hover text-text" : "text-text-2 hover:bg-hover hover:text-text"}`
          }
          style={{ height: "var(--nav-item-h)" }}
        >
          <SettingsIcon size={16} />
          <span className="flex-1">Settings</span>
        </NavLink>
      </div>
      <div className="p-2.5 border-t border-border-subtle">
        <Menu
          align="start"
          trigger={
            <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 h-10 text-left hover:bg-hover transition-colors">
              <span className="grid place-items-center size-6 rounded-full bg-surface-3 text-text-2 text-xs font-semibold shrink-0">{me.user.name.charAt(0).toUpperCase()}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium">{me.user.name}</span>
                <span className="block truncate text-xs text-text-3">{me.user.email}</span>
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
