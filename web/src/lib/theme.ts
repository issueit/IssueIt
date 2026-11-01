import { useSyncExternalStore } from "react";

/** How the app looks, kept in this browser rather than on the server: it is
 *  about the screen in front of you, not about the account. */
export type ThemePref = "system" | "light" | "dark";
export type Accent = "none" | "blue" | "violet" | "green" | "amber";
export type Density = "comfortable" | "compact";
/** Interface scale. "m" is the size the app ships at. */
export type Zoom = "s" | "m" | "l" | "xl";
/** Text weight, one step either side of the one it ships at. */
export type Weight = "light" | "medium" | "heavy";
export type SidebarState = "expanded" | "collapsed";

const listeners = new Set<() => void>();
const media = window.matchMedia("(prefers-color-scheme: dark)");

function read() {
  return {
    theme: (localStorage.getItem("issueit.theme") as ThemePref) || "system",
    accent: (localStorage.getItem("issueit.accent") as Accent) || "none",
    density: (localStorage.getItem("issueit.density") as Density) || "comfortable",
    zoom: (localStorage.getItem("issueit.zoom") as Zoom) || "m",
    weight: (localStorage.getItem("issueit.weight") as Weight) || "medium",
    sidebar: (localStorage.getItem("issueit.sidebar") as SidebarState) || "expanded",
  };
}

let snapshot = read();

function apply() {
  const dark = snapshot.theme === "dark" || (snapshot.theme === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (snapshot.accent === "none") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = snapshot.accent;
  if (snapshot.density === "compact") document.documentElement.dataset.density = "compact";
  else delete document.documentElement.dataset.density;
  // The shipped size and weight are the defaults in the stylesheet, so they
  // need no attribute at all.
  if (snapshot.zoom === "m") delete document.documentElement.dataset.zoom;
  else document.documentElement.dataset.zoom = snapshot.zoom;
  if (snapshot.weight === "medium") delete document.documentElement.dataset.weight;
  else document.documentElement.dataset.weight = snapshot.weight;
}

/** The theme actually showing, after "system" is resolved. */
export const resolvedTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

media.addEventListener("change", () => {
  apply();
  // Charts read colours from the theme, so tell them when "system" flips.
  snapshot = { ...snapshot };
  listeners.forEach((l) => l());
});
apply();

export function setTheme(theme: ThemePref) {
  localStorage.setItem("issueit.theme", theme);
  snapshot = { ...snapshot, theme };
  apply();
  listeners.forEach((l) => l());
}

export function setAccent(accent: Accent) {
  localStorage.setItem("issueit.accent", accent);
  snapshot = { ...snapshot, accent };
  apply();
  listeners.forEach((l) => l());
}

export function setDensity(density: Density) {
  localStorage.setItem("issueit.density", density);
  snapshot = { ...snapshot, density };
  apply();
  listeners.forEach((l) => l());
}

export function setZoom(zoom: Zoom) {
  localStorage.setItem("issueit.zoom", zoom);
  snapshot = { ...snapshot, zoom };
  apply();
  listeners.forEach((l) => l());
}

export function setWeight(weight: Weight) {
  localStorage.setItem("issueit.weight", weight);
  snapshot = { ...snapshot, weight };
  apply();
  listeners.forEach((l) => l());
}

export function setSidebar(sidebar: SidebarState) {
  localStorage.setItem("issueit.sidebar", sidebar);
  snapshot = { ...snapshot, sidebar };
  apply();
  listeners.forEach((l) => l());
}

export function useAppearance() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
