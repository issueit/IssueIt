import { Link } from "react-router";
import { usePreferences } from "../../lib/preferences";
import { Switch } from "../../components/ui/controls";
import { Skeleton } from "../../components/ui/feedback";
import { SetGroup, SetRow } from "../../components/ui/layout";

/** Everything a single key does, and where it does it. */
const groups: Array<{ title: string; where: string; keys: Array<[string, string]> }> = [
  {
    title: "Report lists",
    where: "The inbox and a project's reports.",
    keys: [
      ["j", "Move down the list"],
      ["k", "Move up the list"],
      ["↓ ↑", "The same, for anyone who would rather use arrows"],
      ["e", "Mark the report as resolved"],
      ["m", "Assign the report to you"],
      ["x", "Choose the report, for acting on several at once"],
      ["⇧ click", "Choose every report between this one and the last"],
    ],
  },
  {
    title: "Anywhere",
    where: "Dialogs, menus, dropdowns and panels.",
    keys: [
      ["Esc", "Close what is open, and give focus back"],
      ["Tab", "Move to the next control"],
      ["↓ ↑", "Move through a menu or a dropdown"],
      ["Enter", "Choose what is highlighted"],
      ["Type", "In an open dropdown, jump to the option that starts with it"],
    ],
  },
];

export function KeyboardSettings() {
  const { ready, app, updateApp } = usePreferences();
  if (!ready) return <Skeleton h={300} />;

  return (
    <>
      <h2 className="page-title mb-1">Keyboard</h2>
      <p className="text-sm text-text-3 mb-4">
        Single keys act on whatever the list has focus on. They never fire while you are typing in a box.
      </p>

      <SetGroup>
        <SetRow label="Single-key shortcuts in lists" hint="Turn off if you would rather j, k, e, m and x did nothing. The keys under Anywhere always work.">
          <Switch label="Single-key shortcuts in lists" checked={app.shortcuts} onChange={(shortcuts) => updateApp({ shortcuts })} />
        </SetRow>
      </SetGroup>

      {groups.map((g) => (
        <SetGroup key={g.title} title={g.title}>
          <SetRow label={g.where} />
          <div className="keys">
            {g.keys.map(([key, what]) => (
              <div key={key} className="keys__row" data-off={g.title === "Report lists" && !app.shortcuts ? "" : undefined}>
                <kbd className="key">{key}</kbd>
                <span>{what}</span>
              </div>
            ))}
          </div>
        </SetGroup>
      ))}

      <p className="hint">
        Shortcuts for your own browser are set by the browser itself. What Issueit sees is set here and on{" "}
        <Link to="/settings/general" className="underline underline-offset-2">
          General
        </Link>
        .
      </p>
    </>
  );
}
