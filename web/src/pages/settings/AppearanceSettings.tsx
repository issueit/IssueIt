import {
  setAccent,
  setDensity,
  setSidebar,
  setTheme,
  setWeight,
  setZoom,
  useAppearance,
  type Accent,
  type Density,
  type ThemePref,
  type Weight,
  type Zoom,
} from "../../lib/theme";
import { Segmented, Switch } from "../../components/ui/controls";
import { Select } from "../../components/ui/Field";
import { SetGroup, SetRow } from "../../components/ui/layout";

const accents: Array<{ value: Accent; label: string }> = [
  { value: "none", label: "Greyscale" },
  { value: "blue", label: "Blue" },
  { value: "violet", label: "Violet" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
];

/** How Issueit looks in this browser. */
export function AppearanceSettings() {
  const a = useAppearance();
  return (
    <>
      <h2 className="page-title mb-1">Appearance</h2>
      <p className="text-sm text-text-3 mb-4">Saved in this browser, so each screen you work on can be set up its own way.</p>

      <SetGroup title="Colour">
        <SetRow label="Theme" hint="System follows your device's light or dark setting.">
          <Segmented<ThemePref>
            ariaLabel="Theme"
            value={a.theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </SetRow>
        <SetRow label="Accent colour" hint="Used for primary buttons and selected items. Greyscale keeps it calm. Charts keep their own colours.">
          <Select aria-label="Accent colour" className="!w-[150px]" value={a.accent} onChange={(e) => setAccent(e.target.value as Accent)} options={accents} />
        </SetRow>
      </SetGroup>

      <SetGroup title="Text">
        <SetRow label="Interface scale" hint="Scales the type, the controls and the rows together. Everything stays in proportion.">
          <Segmented<Zoom>
            ariaLabel="Interface scale"
            value={a.zoom}
            onChange={setZoom}
            options={[
              { value: "s", label: "Small" },
              { value: "m", label: "Default" },
              { value: "l", label: "Large" },
              { value: "xl", label: "Largest" },
            ]}
          />
        </SetRow>
        <SetRow label="Text weight" hint="Heavier text holds up better on a bright screen; lighter suits a dim one.">
          <Segmented<Weight>
            ariaLabel="Text weight"
            value={a.weight}
            onChange={setWeight}
            options={[
              { value: "light", label: "Light" },
              { value: "medium", label: "Default" },
              { value: "heavy", label: "Heavy" },
            ]}
          />
        </SetRow>
      </SetGroup>

      <SetGroup title="Layout">
        <SetRow label="Density" hint="Compact makes rows, controls and the sidebar a little smaller everywhere.">
          <Segmented<Density>
            ariaLabel="Density"
            value={a.density}
            onChange={setDensity}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </SetRow>
        <SetRow label="Collapse the sidebar" hint="Keeps the navigation as icons, with the names in their tooltips. The button at the top of the sidebar does the same.">
          <Switch label="Collapse the sidebar" checked={a.sidebar === "collapsed"} onChange={(on) => setSidebar(on ? "collapsed" : "expanded")} />
        </SetRow>
      </SetGroup>
    </>
  );
}
