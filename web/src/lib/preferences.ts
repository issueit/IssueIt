import { useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { setDateFormat } from "./format";
import { useOrg } from "./session";
import type { AnalyticsRange } from "./types";

/**
 * Your dashboard, saved per organisation on the server so it follows you
 * between browsers: which period, and which project. That's all there is to
 * choose; layouts saved before the dashboard was simplified are ignored.
 */

export type DashboardPrefs = {
  range: AnalyticsRange;
  /** A project id, or "all". */
  project: string;
};

export const defaultDashboard: DashboardPrefs = { range: "30d", project: "all" };

/**
 * How the app behaves, as opposed to how the dashboard draws. Saved on the
 * server beside the dashboard, so it follows you between browsers; the things
 * that belong to the screen in front of you - theme, scale, density - stay in
 * this browser instead, in lib/theme.ts.
 */
export type AppPrefs = {
  /** Where signing in takes you. */
  startPage: "dashboard" | "inbox" | "projects";
  /** A report opens beside the list, or fills the page. */
  reportsOpenIn: "panel" | "page";
  /** The status filter a report list starts on. */
  inboxStatus: "open" | "new" | "investigating" | "resolved" | "closed" | "all";
  /** Ask before deleting reports. Off deletes straight away. */
  confirmDeletes: boolean;
  /** "2d ago", or the date and time in full. */
  dates: "relative" | "absolute";
  clock: "24h" | "12h";
  weekStart: "mon" | "sun";
  /** j, k, e, m and x in report lists. */
  shortcuts: boolean;
  /** Which details each report row carries under its title. */
  rowMeta: RowMeta[];
};

export type RowMeta = "project" | "number" | "source" | "environment" | "reporter";

export const rowMetaLabels: Record<RowMeta, string> = {
  project: "Project",
  number: "Report number",
  source: "Where it came from",
  environment: "Environment",
  reporter: "Who reported it",
};

export const startPageLabels: Record<AppPrefs["startPage"], string> = { dashboard: "Dashboard", inbox: "Inbox", projects: "Projects" };

export const defaultApp: AppPrefs = {
  startPage: "dashboard",
  reportsOpenIn: "panel",
  inboxStatus: "open",
  confirmDeletes: true,
  dates: "relative",
  clock: "24h",
  weekStart: "mon",
  shortcuts: true,
  rowMeta: ["project", "number", "source", "environment", "reporter"],
};

export type Preferences = { dashboard: DashboardPrefs; app: AppPrefs };

function normaliseApp(saved: Partial<AppPrefs> | undefined): AppPrefs {
  const merged = { ...defaultApp, ...(saved ?? {}) };
  return { ...merged, rowMeta: (merged.rowMeta ?? []).filter((m) => m in rowMetaLabels) };
}

function normaliseDashboard(saved: Partial<DashboardPrefs> | undefined): DashboardPrefs {
  return {
    range: typeof saved?.range === "string" ? saved.range : defaultDashboard.range,
    project: typeof saved?.project === "string" ? saved.project : defaultDashboard.project,
  };
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
  const appTimer = useRef<number | null>(null);
  const dashboard = useMemo(() => normaliseDashboard(query.data?.preferences.dashboard as Partial<DashboardPrefs> | undefined), [query.data]);
  const app = useMemo(() => normaliseApp(query.data?.preferences.app as Partial<AppPrefs> | undefined), [query.data]);
  // Dates are written by a plain function, not a hook, so it is told here.
  setDateFormat(app);

  /** Applies at once; saves shortly after the last change so a run of clicks is one request. */
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

  /** The same save-shortly-after pattern, for the app's own settings. */
  const updateApp = useCallback(
    (change: Partial<AppPrefs>) => {
      let next: Record<string, unknown> = {};
      qc.setQueryData<{ preferences: Record<string, unknown> }>(key, (old) => {
        const current = normaliseApp(old?.preferences.app as Partial<AppPrefs> | undefined);
        next = { ...(old?.preferences ?? {}), app: { ...current, ...change } };
        return { preferences: next };
      });
      if (appTimer.current) window.clearTimeout(appTimer.current);
      appTimer.current = window.setTimeout(() => {
        void api(path("/preferences"), { method: "PUT", body: { preferences: next } }).catch(() => qc.invalidateQueries({ queryKey: key }));
      }, 450);
    },
    [qc, key, path],
  );

  const resetApp = useCallback(() => updateApp(defaultApp), [updateApp]);

  return { ready: !query.isPending, dashboard, updateDashboard, resetDashboard, app, updateApp, resetApp };
}
