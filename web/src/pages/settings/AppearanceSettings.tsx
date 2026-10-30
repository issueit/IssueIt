import { setAccent, setDensity, setTheme, useAppearance, type Accent, type Density, type ThemePref } from "../../lib/theme";
import { Segmented } from "../../components/ui/controls";
import { Select } from "../../components/ui/Field";
import { SetGroup, SetRow } from "../../components/ui/layout";

/** How Issueit looks in this browser. */
export function AppearanceSettings() {
  const appearance = useAppearance();
  return (
    <>
      <h2 className="page-title mb-1">Appearance</h2>
      <p className="text-sm text-text-3 mb-4">Saved in this browser.</p>
      <SetGroup title="Colour">
        <SetRow label="Theme" hint="System follows your device's light or dark setting.">
          <Segmented<ThemePref>
            ariaLabel="Theme"
            value={appearance.theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </SetRow>
        <SetRow label="Accent colour" hint="Used for primary buttons and selected items. Greyscale keeps it calm. Charts keep their own colours.">
          <Select
            aria-label="Accent colour"
            className="!w-[140px]"
            value={appearance.accent}
            onChange={(e) => setAccent(e.target.value as Accent)}
            options={[
              { value: "none", label: "Greyscale" },
              { value: "blue", label: "Blue" },
              { value: "violet", label: "Violet" },
              { value: "green", label: "Green" },
              { value: "amber", label: "Amber" },
            ]}
          />
        </SetRow>
      </SetGroup>
      <SetGroup title="Layout">
        <SetRow label="Density" hint="Compact makes rows, controls and the sidebar a little smaller everywhere.">
          <Segmented<Density>
            ariaLabel="Density"
            value={appearance.density}
            onChange={setDensity}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </SetRow>
      </SetGroup>
    </>
  );
}
