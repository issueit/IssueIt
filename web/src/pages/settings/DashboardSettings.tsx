import { Link } from "react-router";
import { cardCatalogue, kindLabels, kpiLabels, moveCard, patchCard, rangeLabels, sizeLabels, usePreferences, type CardId, type CardSize, type ChartKind, type KpiId } from "../../lib/preferences";
import { useProjects } from "../../lib/queries";
import type { AnalyticsRange } from "../../lib/types";
import { Button, IconButton } from "../../components/ui/Button";
import { Checkbox, Segmented, Slider, Switch } from "../../components/ui/controls";
import { confirm } from "../../components/ui/Dialog";
import { Input, Select } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/feedback";
import { AltArrowDownIcon, AltArrowLeftIcon, UndoLeftIcon } from "../../components/ui/icons";
import { SetGroup, SetRow } from "../../components/ui/layout";

/** Your dashboard: which cards, in what order, how they draw. Saved for you in this organisation. */
export function DashboardSettings() {
  const { ready, dashboard: d, updateDashboard, resetDashboard } = usePreferences();
  const projects = useProjects();
  if (!ready) return <Skeleton h={300} />;

  const reset = async () => {
    if (await confirm({ title: "Reset your dashboard?", message: "Cards, order and display options go back to the defaults.", confirmLabel: "Reset", danger: true })) resetDashboard();
  };
  const toggleKpi = (id: KpiId, on: boolean) => updateDashboard((x) => ({ ...x, kpis: on ? [...x.kpis, id] : x.kpis.filter((k) => k !== id) }));

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <h2 className="page-title">Dashboard</h2>
        <Button size="sm" variant="quiet" icon={UndoLeftIcon} onClick={reset}>
          Reset to defaults
        </Button>
      </div>
      <p className="text-sm text-text-3 mb-4">
        Just for you, in this organisation. Changes save as you make them; you can also customise straight from the{" "}
        <Link to="/dashboard" className="underline underline-offset-2">
          dashboard
        </Link>
        .
      </p>

      <SetGroup title="When it opens">
        <SetRow label="Time range">
          <Segmented<AnalyticsRange>
            ariaLabel="Default time range"
            value={d.range}
            onChange={(range) => updateDashboard({ range })}
            options={(Object.keys(rangeLabels) as AnalyticsRange[]).map((r) => ({ value: r, label: rangeLabels[r] }))}
          />
        </SetRow>
        <SetRow label="Projects">
          <Select
            small
            aria-label="Projects"
            className="!w-[180px]"
            value={d.project}
            onChange={(e) => updateDashboard({ project: e.target.value })}
            options={[{ value: "all", label: "All projects" }, ...(projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
          />
        </SetRow>
        <SetRow label="Live updates" hint="Charts refresh the moment a report arrives or a delivery changes. Turn off for a steady view.">
          <Switch label="Live updates" checked={d.live} onChange={(live) => updateDashboard({ live })} />
        </SetRow>
        <SetRow label="Compare with the period before" hint="Shows the change on key numbers and a dashed line on reports over time.">
          <Switch label="Compare with the period before" checked={d.compare} onChange={(compare) => updateDashboard({ compare })} />
        </SetRow>
      </SetGroup>

      <SetGroup title="Cards">
        {d.cards.map((card, i) => {
          const info = cardCatalogue[card.id as CardId];
          return (
            <div key={card.id} className="set-row" style={{ opacity: card.visible ? 1 : 0.6 }}>
              <div className="flex flex-col">
                <IconButton size="sm" icon={AltArrowLeftIcon} className="rotate-90" label={`Move ${info.title} up`} disabled={i === 0} onClick={() => updateDashboard((x) => moveCard(x, card.id, i - 1))} />
                <IconButton size="sm" icon={AltArrowDownIcon} label={`Move ${info.title} down`} disabled={i === d.cards.length - 1} onClick={() => updateDashboard((x) => moveCard(x, card.id, i + 1))} />
              </div>
              <div className="set-row__text">
                <Input
                  size_="sm"
                  aria-label={`Title for ${info.title}`}
                  className="!w-[220px] !bg-transparent !border-transparent hover:!border-border focus:!border-border font-medium !px-1.5 -ml-1.5"
                  defaultValue={card.title ?? info.title}
                  key={card.title ?? info.title}
                  maxLength={60}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    updateDashboard((x) => patchCard(x, card.id, { title: t && t !== info.title ? t : undefined }));
                  }}
                />
                <div className="set-row__hint">{info.description}</div>
              </div>
              <div className="set-row__control">
                {info.kinds.length > 1 && (
                  <Select
                    small
                    aria-label={`Chart for ${info.title}`}
                    className="!w-[110px]"
                    value={card.kind}
                    onChange={(e) => updateDashboard((x) => patchCard(x, card.id, { kind: e.target.value as ChartKind }))}
                    options={info.kinds.map((k) => ({ value: k, label: kindLabels[k] }))}
                  />
                )}
                <Select
                  small
                  aria-label={`Width of ${info.title}`}
                  className="!w-[110px]"
                  value={card.size}
                  onChange={(e) => updateDashboard((x) => patchCard(x, card.id, { size: e.target.value as CardSize }))}
                  options={(Object.keys(sizeLabels) as CardSize[]).map((s) => ({ value: s, label: sizeLabels[s] }))}
                />
                <Switch label={`Show ${info.title}`} checked={card.visible} onChange={(visible) => updateDashboard((x) => patchCard(x, card.id, { visible }))} />
              </div>
            </div>
          );
        })}
      </SetGroup>

      <SetGroup title="Key numbers">
        <div className="p-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {(Object.keys(kpiLabels) as KpiId[]).map((id) => (
            <Checkbox key={id} checked={d.kpis.includes(id)} onChange={(on) => toggleKpi(id, on)}>
              {kpiLabels[id]}
            </Checkbox>
          ))}
        </div>
      </SetGroup>

      <SetGroup title="Charts">
        <SetRow label="Chart height">
          <Slider label="Chart height" value={d.chartHeight} min={140} max={380} step={10} unit="px" onChange={(chartHeight) => updateDashboard({ chartHeight })} />
        </SetRow>
        <SetRow label="Density" hint="Compact fits more on screen.">
          <Segmented
            ariaLabel="Density"
            value={d.density}
            onChange={(density) => updateDashboard({ density })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </SetRow>
        <SetRow label="Legend position" hint="Charts with more than one series always have a legend.">
          <Segmented
            ariaLabel="Legend position"
            value={d.legend}
            onChange={(legend) => updateDashboard({ legend })}
            options={[
              { value: "top", label: "Top" },
              { value: "bottom", label: "Bottom" },
              { value: "right", label: "Right" },
            ]}
          />
        </SetRow>
        <SetRow label="Split reports by priority" hint="Stacks the reports-over-time columns by priority.">
          <Switch label="Split reports by priority" checked={d.stackPriority} onChange={(stackPriority) => updateDashboard({ stackPriority })} />
        </SetRow>
        <SetRow label="Values on bars" hint="Writes the number at the end of each bar in single-series charts.">
          <Switch label="Values on bars" checked={d.values} onChange={(values) => updateDashboard({ values })} />
        </SetRow>
        <SetRow label="Smooth lines">
          <Switch label="Smooth lines" checked={d.smooth} onChange={(smooth) => updateDashboard({ smooth })} />
        </SetRow>
        <SetRow label="Gridlines">
          <Switch label="Gridlines" checked={d.grid} onChange={(grid) => updateDashboard({ grid })} />
        </SetRow>
        <SetRow label="Animations" hint="Also off whenever your system asks for reduced motion.">
          <Switch label="Animations" checked={d.animations} onChange={(animations) => updateDashboard({ animations })} />
        </SetRow>
        <SetRow label="Items per breakdown" hint="The rest fold into Other, so colours stay easy to tell apart.">
          <Slider label="Items per breakdown" value={d.topN} min={3} max={8} onChange={(topN) => updateDashboard({ topN })} />
        </SetRow>
        <SetRow label="Large numbers">
          <Segmented
            ariaLabel="Large numbers"
            value={d.numbers}
            onChange={(numbers) => updateDashboard({ numbers })}
            options={[
              { value: "compact", label: "12.3K" },
              { value: "full", label: "12,345" },
            ]}
          />
        </SetRow>
      </SetGroup>

      <SetGroup title="Map">
        <SetRow label="Colour scale" hint="Logarithmic shows the difference between small countries when one dominates.">
          <Segmented
            ariaLabel="Map colour scale"
            value={d.mapScale}
            onChange={(mapScale) => updateDashboard({ mapScale })}
            options={[
              { value: "linear", label: "Linear" },
              { value: "log", label: "Logarithmic" },
            ]}
          />
        </SetRow>
        <SetRow label="Top countries beside the map">
          <Switch label="Top countries beside the map" checked={d.mapList} onChange={(mapList) => updateDashboard({ mapList })} />
        </SetRow>
        <SetRow label="Where locations come from" hint="Set for the whole organisation.">
          <Link to="/settings/organisation#location" className="btn btn--sm btn--quiet">
            Organisation settings
          </Link>
        </SetRow>
      </SetGroup>
    </>
  );
}
