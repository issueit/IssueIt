import { Link } from "react-router";
import {
  defaultApp,
  rowMetaLabels,
  startPageLabels,
  usePreferences,
  type AppPrefs,
  type RowMeta,
} from "../../lib/preferences";
import { Button } from "../../components/ui/Button";
import { Checkbox, Segmented, Switch } from "../../components/ui/controls";
import { confirm } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/feedback";
import { UndoLeftIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";

const statusOptions: Array<{ value: AppPrefs["inboxStatus"]; label: string }> = [
  { value: "open", label: "Open" },
  { value: "new", label: "New" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All statuses" },
];

/** How the app behaves: where it opens, how reports are read, how dates are written. */
export function GeneralSettings() {
  const { ready, app, updateApp, resetApp } = usePreferences();
  if (!ready) return <Skeleton h={300} />;

  const reset = async () => {
    if (await confirm({ title: "Reset these settings?", message: "Everything on this page goes back to the defaults.", confirmLabel: "Reset", danger: true })) resetApp();
  };
  const toggleMeta = (id: RowMeta, on: boolean) =>
    // Kept in the catalogue's order, so the row always reads the same way.
    updateApp({ rowMeta: (Object.keys(rowMetaLabels) as RowMeta[]).filter((m) => (m === id ? on : app.rowMeta.includes(m))) });

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <h2 className="page-title">General</h2>
        <Button size="sm" variant="quiet" icon={UndoLeftIcon} onClick={reset}>
          Reset to defaults
        </Button>
      </div>
      <p className="text-sm text-text-3 mb-4">Yours, in this organisation, on every browser you sign in from. How it looks lives in <Link to="/settings/appearance" className="underline underline-offset-2">Appearance</Link>.</p>

      <SetGroup title="Starting up">
        <SetRow label="On sign-in, open" hint="Where you land when you sign in without having asked for a particular page.">
          <Select
            aria-label="On sign-in, open"
            className="!w-[160px]"
            value={app.startPage}
            onChange={(e) => updateApp({ startPage: e.target.value as AppPrefs["startPage"] })}
            options={(Object.keys(startPageLabels) as Array<AppPrefs["startPage"]>).map((k) => ({ value: k, label: startPageLabels[k] }))}
          />
        </SetRow>
      </SetGroup>

      <SetGroup title="Reports">
        <SetRow label="Reports open in" hint="A side panel keeps the list in view. Full width gives long reports and screenshots more room.">
          <Segmented<AppPrefs["reportsOpenIn"]>
            ariaLabel="Reports open in"
            value={app.reportsOpenIn}
            onChange={(reportsOpenIn) => updateApp({ reportsOpenIn })}
            options={[
              { value: "panel", label: "Side panel" },
              { value: "page", label: "Full width" },
            ]}
          />
        </SetRow>
        <SetRow label="Lists start on" hint="The status filter the inbox and each project's reports open with.">
          <Select
            aria-label="Lists start on"
            className="!w-[160px]"
            value={app.inboxStatus}
            onChange={(e) => updateApp({ inboxStatus: e.target.value as AppPrefs["inboxStatus"] })}
            options={statusOptions}
          />
        </SetRow>
        <SetRow label="What each row shows" hint="The line under a report's title. Fewer details make a longer list easier to scan." />
        <div className="px-3.5 pb-3.5 -mt-1 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {(Object.keys(rowMetaLabels) as RowMeta[]).map((id) => (
            <Checkbox key={id} checked={app.rowMeta.includes(id)} onChange={(on) => toggleMeta(id, on)}>
              {rowMetaLabels[id]}
            </Checkbox>
          ))}
        </div>
      </SetGroup>

      <SetGroup title="Behaviour">
        <SetRow label="Ask before deleting" hint="Deleting a report takes its attachments with it. Turn this off only if you are sure.">
          <Switch label="Ask before deleting" checked={app.confirmDeletes} onChange={(confirmDeletes) => updateApp({ confirmDeletes })} />
        </SetRow>
        <SetRow
          label="Keyboard shortcuts"
          hint={
            <>
              Single keys for moving through and acting on a list. <Link to="/settings/keyboard" className="underline underline-offset-2">See them all</Link>.
            </>
          }
        >
          <Switch label="Keyboard shortcuts" checked={app.shortcuts} onChange={(shortcuts) => updateApp({ shortcuts })} />
        </SetRow>
      </SetGroup>

      <SetGroup title="Dates and times">
        <SetRow label="Dates" hint={`Relative reads "2d ago"; exact reads "${new Date().toLocaleString("en-GB", { day: "numeric", month: "short" })} 14:32".`}>
          <Segmented<AppPrefs["dates"]>
            ariaLabel="Dates"
            value={app.dates}
            onChange={(dates) => updateApp({ dates })}
            options={[
              { value: "relative", label: "Relative" },
              { value: "absolute", label: "Exact" },
            ]}
          />
        </SetRow>
        <SetRow label="Clock">
          <Segmented<AppPrefs["clock"]>
            ariaLabel="Clock"
            value={app.clock}
            onChange={(clock) => updateApp({ clock })}
            options={[
              { value: "24h", label: "14:00" },
              { value: "12h", label: "2pm" },
            ]}
          />
        </SetRow>
        <SetRow label="Time zone" hint="Taken from this device. Dates and the dashboard chart are drawn in it.">
          <span className="text-sm text-text-2">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </SetRow>
      </SetGroup>

      <p className="hint">
        Defaults: open the {startPageLabels[defaultApp.startPage].toLowerCase()}, reports in a side panel, relative dates on a 24-hour clock.
      </p>
    </>
  );
}
