import { useMemo, useState, type ComponentType } from "react";
import { NavLink, Outlet } from "react-router";
import { Input } from "../../components/ui/Field";
import {
  BellIcon,
  Chart2Icon,
  GlobalIcon,
  GraphUpIcon,
  HistoryIcon,
  InfoCircleIcon,
  KeyMinimalistic2Icon,
  MagnifierIcon,
  PaletteIcon,
  PlugCircleIcon,
  Routing2Icon,
  SettingsIcon,
  TextFieldIcon,
  Tuning2Icon,
  UserCircleIcon,
  UsersGroupRoundedIcon,
} from "../../components/ui/icons";
import { PageHeader } from "../../components/ui/layout";
import { hostedSettings } from "../../hosted";

type Item = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** What someone might type looking for a setting on this page. */
  finds: string;
};

const base: Array<{ heading: string; items: Item[] }> = [
  {
    heading: "You",
    items: [
      { to: "general", label: "General", icon: Tuning2Icon, finds: "start page sign in landing reports side panel full width status filter rows confirm delete shortcuts dates relative exact clock 24 hour week starts monday sunday time zone" },
      { to: "appearance", label: "Appearance", icon: PaletteIcon, finds: "theme dark light system accent colour greyscale blue violet green amber interface scale zoom text size weight heavy density compact sidebar collapse" },
      { to: "dashboard", label: "Dashboard", icon: Chart2Icon, finds: "cards order chart kind width rename key numbers kpi tiles legend gridlines animations smooth markers tooltips shares heatmap map colour scale top countries range project live compare" },
      { to: "keyboard", label: "Keyboard", icon: TextFieldIcon, finds: "shortcuts keys j k e m x escape tab enter" },
      { to: "notifications", label: "Notifications", icon: BellIcon, finds: "email alerts digest mentions assigned mute" },
      { to: "account", label: "Account", icon: UserCircleIcon, finds: "name email password two factor authentication sessions sign out delete account" },
    ],
  },
  {
    heading: "Organisation",
    items: [
      { to: "organisation", label: "Organisation", icon: GlobalIcon, finds: "name location country time zone proxy retention delete organisation" },
      { to: "members", label: "Members", icon: UsersGroupRoundedIcon, finds: "people invite roles owner admin permissions" },
      { to: "usage", label: "Usage and limits", icon: GraphUpIcon, finds: "reports storage attachments quota month" },
    ],
  },
  {
    heading: "Integrations",
    items: [
      { to: "delivery", label: "Delivery defaults", icon: Routing2Icon, finds: "retries backoff timeout failures pause policy" },
      { to: "connections", label: "Connected accounts", icon: PlugCircleIcon, finds: "github jira slack linear trello resend oauth reconnect" },
    ],
  },
  {
    heading: "Developers",
    items: [
      { to: "tokens", label: "Account tokens", icon: KeyMinimalistic2Icon, finds: "api token bearer scopes mcp cli revoke" },
      { to: "audit", label: "Audit log", icon: HistoryIcon, finds: "history who did what changes actions ip" },
      { to: "about", label: "About", icon: InfoCircleIcon, finds: "version edition self hosted addresses support diagnostics" },
    ],
  },
];

/** Plus whatever this edition adds — the hosted service's plan and billing. */
const sections = base.map((section) => {
  const extra = hostedSettings.filter((s) => s.heading === section.heading);
  return extra.length ? { ...section, items: [...section.items, ...extra.map(({ path, label, icon, finds }) => ({ to: path, label, icon, finds }))] } : section;
});

/** Settings: a rail on the left moves between pages; each page is groups of rows. */
export function SettingsLayout() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const all = sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.heading })));
    return all.filter((i) => words.every((w) => `${i.section} ${i.label} ${i.finds}`.toLowerCase().includes(w)));
  }, [query]);

  const link = (i: Item, sub?: string) => (
    <NavLink key={i.to} to={i.to} className="set-nav__item">
      <i.icon size={15} />
      <span className="flex-1 min-w-0 truncate">{i.label}</span>
      {sub && <span className="set-nav__where">{sub}</span>}
    </NavLink>
  );

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader icon={SettingsIcon} title="Settings" />
      <div className="flex flex-col md:flex-row flex-1">
        <nav className="set-nav" aria-label="Settings sections">
          <div className="set-nav__search">
            <MagnifierIcon size={14} />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="!h-auto !border-0 !bg-transparent !px-0"
            />
          </div>
          {results ? (
            <div className="set-nav__group">
              {results.length ? results.map((i) => link(i, i.section)) : <p className="set-nav__none">Nothing matches "{query}".</p>}
            </div>
          ) : (
            sections.map((s) => (
              <div key={s.heading} className="set-nav__group">
                <div className="set-nav__heading">{s.heading}</div>
                {s.items.map((i) => link(i))}
              </div>
            ))
          )}
        </nav>
        <div className="flex-1 min-w-0 page-body page-body--narrow">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
