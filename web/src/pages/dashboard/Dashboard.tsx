import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { describeError } from "../../lib/api";
import { setLiveAnalytics } from "../../lib/events";
import {
  cardCatalogue,
  kindLabels,
  moveCard,
  patchCard,
  rangeLabels,
  sizeLabels,
  usePreferences,
  type CardId,
  type CardSize,
} from "../../lib/preferences";
import { useAnalytics, useOrgDestinations, useProjects, useProviders, useReports } from "../../lib/queries";
import type { AnalyticsRange } from "../../lib/types";
import { Button, IconButton } from "../../components/ui/Button";
import { Segmented } from "../../components/ui/controls";
import { prompt } from "../../components/ui/Dialog";
import { Select } from "../../components/ui/Field";
import { Callout, Skeleton } from "../../components/ui/feedback";
import {
  AddIcon,
  Chart2Icon,
  CheckIcon,
  EyeClosedIcon,
  MenuDotsIcon,
  PenIcon,
  RefreshIcon,
  ReorderIcon,
  SettingsIcon,
  TuningIcon,
  UndoLeftIcon,
} from "../../components/ui/icons";
import { Menu, type MenuItem } from "../../components/ui/Menu";
import { PageHeader } from "../../components/ui/layout";
import { Tooltip } from "../../components/ui/Tooltip";
import { CardBody, cardIsEmpty, cardSummary, type CardContext } from "../../features/dashboard/cards";
import { OnboardingCard } from "../../features/dashboard/Onboarding";
import { useVizTheme } from "../../features/dashboard/chart";

const rangeLong: Record<AnalyticsRange, string> = {
  "24h": "the last 24 hours",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  "90d": "the last 90 days",
  "12m": "the last 12 months",
};

export default function DashboardPage() {
  const { ready, dashboard: saved, updateDashboard, resetDashboard, app } = usePreferences();
  // Reduced motion wins over the animation setting.
  const prefs = useMemo(() => ({ ...saved, animations: saved.animations && !matchMedia("(prefers-reduced-motion: reduce)").matches }), [saved]);
  const projects = useProjects();
  const providers = useProviders();
  const scope = prefs.project !== "all" && projects.data?.projects.some((p) => p.id === prefs.project) ? prefs.project : undefined;
  const analytics = useAnalytics(prefs.range, scope);
  const recent = useReports({ project: scope, status: "all" });
  const destinations = useOrgDestinations();
  const theme = useVizTheme();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<CardId | null>(null);
  const [over, setOver] = useState<CardId | null>(null);

  useEffect(() => {
    setLiveAnalytics(prefs.live);
    return () => setLiveAnalytics(true);
  }, [prefs.live]);

  const providerName = useMemo(() => {
    const names = new Map(providers.data?.providers.map((p) => [p.id, p.name]));
    return (id: string) => names.get(id) ?? id;
  }, [providers.data]);

  const hidden = prefs.cards.filter((c) => !c.visible);
  const height = prefs.density === "compact" ? Math.round(prefs.chartHeight * 0.85) : prefs.chartHeight;
  const recentReports = recent.data?.pages[0]?.reports;
  const filteredDestinations = destinations.data?.destinations.filter((d) => !scope || d.projectId === scope);

  /** Everything a card needs to draw itself, which is also what decides whether it has anything to say. */
  const context = (card: { id: CardId; kind: CardContext["kind"]; size: CardSize }): CardContext => ({
    data: analytics.data!,
    prefs,
    app,
    theme,
    height,
    kind: card.kind,
    wide: card.size === "l" || card.size === "xl",
    providerName,
    recent: recentReports,
    destinations: filteredDestinations,
  });

  const shown = prefs.cards.filter((c) => c.visible);
  // While customising, every chosen card stays put: cards must not vanish from
  // under the pointer as the data behind them changes.
  const visible = !analytics.data || editing || !prefs.hideEmpty ? shown : shown.filter((c) => !cardIsEmpty(c.id, context(c)));
  const emptied = shown.length - visible.length;

  const onDrop = (e: DragEvent, target: CardId) => {
    e.preventDefault();
    if (!dragging || dragging === target) return;
    updateDashboard((d) => moveCard(d, dragging, d.cards.findIndex((c) => c.id === target)));
    setDragging(null);
    setOver(null);
  };

  const scopeName = scope ? projects.data?.projects.find((p) => p.id === scope)?.name : "All projects";

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        icon={Chart2Icon}
        title="Dashboard"
        actions={
          <>
            <Select
              small
              aria-label="Project"
              className="!w-auto max-w-[190px]"
              value={scope ?? "all"}
              onChange={(e) => updateDashboard({ project: e.target.value })}
              options={[{ value: "all", label: "All projects" }, ...(projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
            />
            <Segmented<AnalyticsRange>
              ariaLabel="Time range"
              value={prefs.range}
              onChange={(range) => updateDashboard({ range })}
              options={(Object.keys(rangeLabels) as AnalyticsRange[]).map((r) => ({ value: r, label: rangeLabels[r] }))}
            />
            <IconButton
              size="sm"
              icon={RefreshIcon}
              label="Refresh now"
              busy={analytics.isFetching && !analytics.isPending}
              onClick={() => void analytics.refetch()}
            />
            {editing ? (
              <Button size="sm" variant="primary" icon={CheckIcon} onClick={() => setEditing(false)}>
                Done
              </Button>
            ) : (
              <Button size="sm" icon={TuningIcon} onClick={() => setEditing(true)}>
                Customise
              </Button>
            )}
          </>
        }
      />

      <div className={`page-body dash ${prefs.density === "compact" ? "dash--compact" : ""}`}>
        {!editing && (
          <div className="dash-grid">
            <OnboardingCard />
          </div>
        )}

        {editing && (
          <div className="dash-editbar" role="region" aria-label="Customising the dashboard">
            <ReorderIcon size={15} />
            <span className="flex-1 text-sm text-text-2">Drag cards to reorder. Use a card's menu to change its chart, its width or its name.</span>
            <Menu
              trigger={
                <Button size="sm" icon={AddIcon} disabled={!hidden.length}>
                  Add card{hidden.length ? ` (${hidden.length})` : ""}
                </Button>
              }
              items={hidden.map((c) => ({
                label: c.title ?? cardCatalogue[c.id].title,
                onSelect: () => updateDashboard((d) => patchCard(d, c.id, { visible: true })),
              }))}
            />
            <Button size="sm" variant="quiet" icon={UndoLeftIcon} onClick={resetDashboard}>
              Reset layout
            </Button>
            <Link to="/settings/dashboard" className="btn btn--sm btn--quiet">
              <SettingsIcon size={13} />
              All options
            </Link>
          </div>
        )}

        {!ready || analytics.isPending ? (
          <div className="dash-grid" data-style={prefs.cardStyle}>
            {shown.slice(0, 6).map((c) => (
              <div key={c.id} className="dash-card" data-size={c.size}>
                <Skeleton h={14} w={120} />
                <Skeleton h={c.id === "kpis" ? 64 : height} className="mt-3" />
              </div>
            ))}
          </div>
        ) : analytics.isError ? (
          <Callout tone="danger" action={<Button size="sm" onClick={() => analytics.refetch()}>Try again</Button>}>
            {describeError(analytics.error, "Couldn't load the dashboard.")}
          </Callout>
        ) : !shown.length ? (
          <Callout tone="info" title="Every card is hidden" action={<Button size="sm" onClick={() => setEditing(true)}>Add cards</Button>}>
            Choose what to show from Customise, or reset the layout.
          </Callout>
        ) : (
          <>
            {prefs.showCaption && (
              <div className="dash-bar">
                <span className="dash-bar__scope">{scopeName}</span>
                <span className="dash-bar__sep" aria-hidden />
                <span>{rangeLong[prefs.range]}</span>
                <Tooltip
                  label={prefs.live ? "Live updates are on" : "Live updates are paused"}
                  hint={prefs.live ? "Charts redraw as reports arrive. Click to pause." : "Click to follow new reports again."}
                >
                  <button type="button" className="dash-live" data-on={prefs.live || undefined} onClick={() => updateDashboard({ live: !prefs.live })}>
                    <span className="dash-live__dot" aria-hidden />
                    {prefs.live ? "Live" : "Paused"}
                  </button>
                </Tooltip>
                {analytics.isFetching && <span className="spinner" aria-label="Updating" />}
                {emptied > 0 && (
                  <button type="button" className="dash-bar__link" onClick={() => updateDashboard({ hideEmpty: false })}>
                    {emptied} empty {emptied === 1 ? "card" : "cards"} hidden
                  </button>
                )}
              </div>
            )}

            <div className="dash-grid" data-style={prefs.cardStyle} data-editing={editing || undefined}>
              {visible.map((card, i) => {
                const info = cardCatalogue[card.id];
                const name = card.title ?? info.title;
                const summary = prefs.summaries ? cardSummary(card.id, analytics.data, prefs.numbers) : null;
                const menu: MenuItem[] = [
                  ...(info.kinds.length > 1
                    ? [
                        { heading: "Show as" } as MenuItem,
                        ...info.kinds.map((k) => ({ label: kindLabels[k], checked: card.kind === k, onSelect: () => updateDashboard((d) => patchCard(d, card.id, { kind: k })) })),
                        "separator" as const,
                      ]
                    : []),
                  { heading: "Width" },
                  ...(Object.keys(sizeLabels) as CardSize[]).map((s) => ({
                    label: sizeLabels[s],
                    checked: card.size === s,
                    onSelect: () => updateDashboard((d) => patchCard(d, card.id, { size: s })),
                  })),
                  "separator",
                  {
                    label: "Rename…",
                    icon: PenIcon,
                    onSelect: async () => {
                      const title = await prompt({ title: "Rename card", label: "Title", initial: name, confirmLabel: "Rename" });
                      if (title !== null) updateDashboard((d) => patchCard(d, card.id, { title: title.trim() && title.trim() !== info.title ? title.trim() : undefined }));
                    },
                  },
                  ...(i > 0 ? [{ label: "Move earlier", onSelect: () => updateDashboard((d) => moveCard(d, card.id, d.cards.findIndex((c) => c.id === visible[i - 1].id))) }] : []),
                  ...(i < visible.length - 1
                    ? [{ label: "Move later", onSelect: () => updateDashboard((d) => moveCard(d, card.id, d.cards.findIndex((c) => c.id === visible[i + 1].id))) }]
                    : []),
                  {
                    label: "Back to its defaults",
                    icon: UndoLeftIcon,
                    disabled: card.kind === info.kind && card.size === info.size && !card.title,
                    onSelect: () => updateDashboard((d) => patchCard(d, card.id, { kind: info.kind, size: info.size, title: undefined })),
                  },
                  "separator",
                  { label: "Hide card", icon: EyeClosedIcon, onSelect: () => updateDashboard((d) => patchCard(d, card.id, { visible: false })) },
                ];
                return (
                  <section
                    key={card.id}
                    className="dash-card"
                    data-size={card.size}
                    data-over={over === card.id || undefined}
                    data-dragging={dragging === card.id || undefined}
                    aria-labelledby={`card-${card.id}`}
                    draggable={editing}
                    onDragStart={(e) => {
                      setDragging(card.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onDragOver={(e) => {
                      if (!editing || !dragging) return;
                      e.preventDefault();
                      setOver(card.id);
                    }}
                    onDragLeave={() => setOver((o) => (o === card.id ? null : o))}
                    onDrop={(e) => onDrop(e, card.id)}
                  >
                    <header className="dash-card__head">
                      {editing && <ReorderIcon size={14} className="dash-card__grip" aria-hidden />}
                      <h2 className="dash-card__title" id={`card-${card.id}`}>
                        {name}
                      </h2>
                      {summary && <span className="dash-card__summary tabular">{summary}</span>}
                      <Menu trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`Options for ${name}`} className="dash-card__menu" />} items={menu} />
                    </header>
                    <div className="dash-card__body">
                      <CardBody id={card.id} ctx={context(card)} />
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
