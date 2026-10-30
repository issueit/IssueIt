import { useSyncExternalStore } from "react";

/** Theme and accent preferences, kept in this browser. */
export type ThemePref = "system" | "light" | "dark";
export type Accent = "none" | "blue" | "violet" | "green" | "amber";
export type Density = "comfortable" | "compact";

const listeners = new Set<() => void>();
const media = window.matchMedia("(prefers-color-scheme: dark)");

function read() {
  return {
    theme: (localStorage.getItem("issueit.theme") as ThemePref) || "system",
    accent: (localStorage.getItem("issueit.accent") as Accent) || "none",
    density: (localStorage.getItem("issueit.density") as Density) || "comfortable",
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

export function useAppearance() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
