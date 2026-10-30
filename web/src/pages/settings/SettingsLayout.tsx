import { NavLink, Outlet } from "react-router";
import { SettingsIcon } from "../../components/ui/icons";
import { PageHeader } from "../../components/ui/layout";

const sections = [
  {
    heading: "Organisation",
    items: [
      { to: "organisation", label: "General" },
      { to: "members", label: "Members" },
      { to: "usage", label: "Usage and limits" },
    ],
  },
  {
    heading: "Integrations",
    items: [
      { to: "delivery", label: "Delivery defaults" },
      { to: "connections", label: "Connected accounts" },
    ],
  },
  {
    heading: "You",
    items: [
      { to: "account", label: "Account" },
      { to: "appearance", label: "Appearance" },
      { to: "dashboard", label: "Dashboard" },
    ],
  },
];

/** Settings: a rail on the left moves between sections; each section is groups of rows. */
export function SettingsLayout() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader icon={SettingsIcon} title="Settings" />
      <div className="flex flex-col md:flex-row flex-1">
        <nav className="md:w-[200px] shrink-0 p-3 md:pt-5 flex md:flex-col gap-4 md:gap-5 overflow-x-auto border-b md:border-b-0 border-border-subtle" aria-label="Settings sections">
          {sections.map((s) => (
            <div key={s.heading} className="flex md:flex-col gap-px shrink-0">
              <div className="hidden md:block px-2 pb-1 text-xs font-semibold text-text-3">{s.heading}</div>
              {s.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  className={({ isActive }) =>
                    `flex items-center px-2 rounded-md text-sm whitespace-nowrap transition-colors ${isActive ? "bg-hover text-text font-medium" : "text-text-2 hover:bg-hover hover:text-text"}`
                  }
                  style={{ height: "var(--nav-item-h)" }}
                >
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex-1 min-w-0 page-body page-body--narrow">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
