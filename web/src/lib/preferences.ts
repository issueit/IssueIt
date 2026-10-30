import { useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useOrg } from "./session";
import type { AnalyticsRange } from "./types";

/**
 * Your dashboard, saved per organisation on the server so it follows you
 * between browsers. Saved values are merged over the defaults below, so a
 * card added in a later release appears without anyone resetting anything.
 */

export type CardId =
  | "kpis"
  | "volume"
  | "map"
  | "status"
  | "priority"
  | "source"
  | "deliveries"
  | "providers"
  | "browser"
  | "os"
  | "device"
  | "environment"
  | "projects"
  | "heatmap"
  | "pages"
  | "recent"
  | "attention";

/** Columns out of twelve: a third, a half, two thirds, the full width. */
export type CardSize = "s" | "m" | "l" | "xl";
export type ChartKind = "tiles" | "bar" | "hbar" | "line" | "area" | "doughnut" | "pie" | "map" | "grid" | "list" | "table";
export type CardPref = { id: CardId; visible: boolean; size: CardSize; kind: ChartKind; title?: string };

export type KpiId = "reports" | "open" | "resolved" | "reporters" | "delivered" | "successRate" | "failing" | "latency" | "attachments";

export type DashboardPrefs = {
  cards: CardPref[];
  range: AnalyticsRange;
  /** A project id, or "all". */
  project: string;
  compare: boolean;
  live: boolean;
  density: "comfortable" | "compact";
  chartHeight: number;
  smooth: boolean;
  grid: boolean;
  legend: "top" | "bottom" | "right";
  values: boolean;
  animations: boolean;
  numbers: "compact" | "full";
  stackPriority: boolean;
  mapScale: "linear" | "log";
  mapList: boolean;
  topN: number;
  kpis: KpiId[];
};

export type CardInfo = { title: string; description: string; kinds: ChartKind[]; kind: ChartKind; size: CardSize; visible: boolean };

/** Every card the dashboard can show, in their default order. */
export const cardCatalogue: Record<CardId, CardInfo> = {
  kpis: { title: "Key numbers", description: "Headline figures for the period, with change against the one before.", kinds: ["tiles", "table"], kind: "tiles", size: "xl", visible: true },
  volume: { title: "Reports over time", description: "How many reports arrived, optionally split by priority.", kinds: ["bar", "line", "area", "table"], kind: "bar", size: "l", visible: true },
  priority: { title: "Priority", description: "How urgent incoming reports are.", kinds: ["hbar", "bar", "doughnut", "table"], kind: "hbar", size: "s", visible: true },
  map: { title: "Where reports come from", description: "A world map shaded by reports per country.", kinds: ["map", "hbar", "table"], kind: "map", size: "l", visible: true },
  status: { title: "Status", description: "Where reports from the period stand now.", kinds: ["doughnut", "pie", "hbar", "table"], kind: "doughnut", size: "s", visible: true },
  deliveries: { title: "Deliveries", description: "Delivered, failed and waiting deliveries over time.", kinds: ["bar", "line", "table"], kind: "bar", size: "m", visible: true },
  providers: { title: "Deliveries by integration", description: "Which services received reports, and how many failed.", kinds: ["hbar", "table"], kind: "hbar", size: "m", visible: true },
  source: { title: "Source", description: "Widget, hosted form, API or your own sources.", kinds: ["doughnut", "pie", "hbar", "table"], kind: "doughnut", size: "s", visible: true },
  browser: { title: "Browsers", description: "Browsers reports were sent from.", kinds: ["hbar", "doughnut", "pie", "table"], kind: "hbar", size: "s", visible: true },
  os: { title: "Operating systems", description: "Operating systems reports were sent from.", kinds: ["hbar", "doughnut", "pie", "table"], kind: "hbar", size: "s", visible: true },
  device: { title: "Devices", description: "Desktop, mobile and tablet.", kinds: ["doughnut", "pie", "hbar", "table"], kind: "doughnut", size: "s", visible: false },
  environment: { title: "Environments", description: "Production, staging and the rest.", kinds: ["hbar", "doughnut", "table"], kind: "hbar", size: "s", visible: false },
  projects: { title: "Projects", description: "Reports per project.", kinds: ["hbar", "bar", "doughnut", "table"], kind: "hbar", size: "m", visible: true },
  heatmap: { title: "When reports arrive", description: "Reports by weekday and hour, in your time zone.", kinds: ["grid", "table"], kind: "grid", size: "m", visible: true },
  pages: { title: "Top pages", description: "The pages people report from most.", kinds: ["list", "hbar", "table"], kind: "list", size: "m", visible: true },
  recent: { title: "Latest reports", description: "The newest reports, live.", kinds: ["list"], kind: "list", size: "m", visible: true },
  attention: { title: "Needs attention", description: "Destinations that are failing or paused.", kinds: ["list"], kind: "list", size: "m", visible: true },
};

export const kpiLabels: Record<KpiId, string> = {
  reports: "Reports",
  open: "Open",
  resolved: "Resolved",
  reporters: "People reporting",
  delivered: "Delivered",
  successRate: "Delivery success",
  failing: "Failing destinations",
  latency: "Median delivery time",
  attachments: "With attachments",
};

export const defaultDashboard: DashboardPrefs = {
  cards: (Object.keys(cardCatalogue) as CardId[]).map((id) => ({ id, visible: cardCatalogue[id].visible, size: cardCatalogue[id].size, kind: cardCatalogue[id].kind })),
  range: "30d",
  project: "all",
  compare: true,
  live: true,
  density: "comfortable",
  chartHeight: 220,
  smooth: true,
  grid: true,
  legend: "bottom",
  values: false,
  animations: true,
  numbers: "compact",
  stackPriority: true,
  mapScale: "linear",
  mapList: true,
  topN: 6,
  kpis: ["reports", "open", "successRate", "latency", "failing", "reporters"],
};

export type Preferences = { dashboard: DashboardPrefs };

/** Saved cards keep their order and settings; unknown ones drop, new ones join at the end. */
function normaliseDashboard(saved: Partial<DashboardPrefs> | undefined): DashboardPrefs {
  const merged = { ...defaultDashboard, ...(saved ?? {}) };
  const known = new Set(Object.keys(cardCatalogue));
  const seen = new Set<string>();
  const cards: CardPref[] = [];
  for (const c of saved?.cards ?? []) {
    if (!known.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    const info = cardCatalogue[c.id];
    cards.push({ ...c, kind: info.kinds.includes(c.kind) ? c.kind : info.kind });
  }
  for (const c of defaultDashboard.cards) if (!seen.has(c.id)) cards.push(c);
  return { ...merged, cards, kpis: (merged.kpis ?? []).filter((k) => k in kpiLabels) };
}

export function usePreferences() {
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const key = useMemo(() => ["org", orgId, "preferences"], [orgId]);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api<{ preferences: Record<string, unknown> }>(path("/preferences"), { signal }),
    staleTime: Infinity,
  });
  const timer = useRef<number | null>(null);
  const dashboard = useMemo(() => normaliseDashboard(query.data?.preferences.dashboard as Partial<DashboardPrefs> | undefined), [query.data]);

  /** Applies at once; saves shortly after the last change so dragging a slider doesn't flood the server. */
  const updateDashboard = useCallback(
    (change: Partial<DashboardPrefs> | ((d: DashboardPrefs) => DashboardPrefs)) => {
      let next: Record<string, unknown> = {};
      qc.setQueryData<{ preferences: Record<string, unknown> }>(key, (old) => {
        const current = normaliseDashboard(old?.preferences.dashboard as Partial<DashboardPrefs> | undefined);
        const dash = typeof change === "function" ? change(current) : { ...current, ...change };
        next = { ...(old?.preferences ?? {}), dashboard: dash };
        return { preferences: next };
      });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void api(path("/preferences"), { method: "PUT", body: { preferences: next } }).catch(() => qc.invalidateQueries({ queryKey: key }));
      }, 450);
    },
    [qc, key, path],
  );

  const resetDashboard = useCallback(() => updateDashboard(() => defaultDashboard), [updateDashboard]);

  return { ready: !query.isPending, dashboard, updateDashboard, resetDashboard };
}

/* ------------------------------------------------------------------ shared by the dashboard and its settings */

export const rangeLabels: Record<AnalyticsRange, string> = { "24h": "24h", "7d": "7d", "30d": "30d", "90d": "90d", "12m": "12m" };

export const kindLabels: Record<ChartKind, string> = {
  tiles: "Tiles",
  bar: "Columns",
  hbar: "Bars",
  line: "Line",
  area: "Area",
  doughnut: "Doughnut",
  pie: "Pie",
  map: "Map",
  grid: "Heatmap",
  list: "List",
  table: "Table",
};
export const sizeLabels: Record<CardSize, string> = { s: "A third", m: "Half", l: "Two thirds", xl: "Full width" };

export function moveCard(d: DashboardPrefs, id: CardId, to: number): DashboardPrefs {
  const cards = [...d.cards];
  const from = cards.findIndex((c) => c.id === id);
  if (from < 0) return d;
  const [card] = cards.splice(from, 1);
  cards.splice(Math.max(0, Math.min(to, cards.length)), 0, card);
  return { ...d, cards };
}

export function patchCard(d: DashboardPrefs, id: CardId, patch: Partial<CardPref>): DashboardPrefs {
  return { ...d, cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}
