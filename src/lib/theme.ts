import { useSyncExternalStore } from "react";
import type { Settings } from "../api/types";

/**
 * Colour themes of silo-web: the enum of settings.theme (silo-server), the default first. Each
 * one is a block of token overrides in src/styles/theme.css, selected by <html data-theme>.
 */
export const THEMES = [
  "default",
  "dark",
  "soft-gray",
  "blue",
  "lavender",
  "rose",
  "mint",
  "seafoam",
] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "default";

// The list must be the enum of the contract (a new server theme fails tsc here).
type ContractTheme = NonNullable<Settings["theme"]>;
const sameAsContract: [Theme] extends [ContractTheme]
  ? [ContractTheme] extends [Theme]
    ? true
    : never
  : never = true;
void sameAsContract;

/**
 * The browser bar colour (<meta name="theme-color">) of each theme: its --color-surface
 * (src/lib/theme.test.ts checks them against theme.css).
 */
export const THEME_COLORS: Record<Theme, string> = {
  default: "#f6f8fc",
  dark: "#131314",
  "soft-gray": "#eceff1",
  blue: "#dde8fb",
  lavender: "#efe9f9",
  rose: "#faeaee",
  mint: "#e6f4ec",
  seafoam: "#e1f3f2",
};

/**
 * The last theme of this browser. public/theme-boot.js reads it before the first paint (the login
 * screen too), so the page never flashes the default colours.
 */
export const THEME_STORAGE_KEY = "silo.theme";

export const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);

function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

let current: Theme = storedTheme();
const listeners = new Set<() => void>();

function applyDocument(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
}
applyDocument(current);

export function getTheme(): Theme {
  return current;
}

/**
 * Applies a theme at once (no reload): <html data-theme> and the browser bar colour. The choice
 * is remembered in localStorage for the next start and the login screen.
 */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode: the theme still applies to this page.
  }
  if (theme === current) return;
  current = theme;
  applyDocument(theme);
  for (const l of listeners) l();
}

/** Applies settings.theme of the server; an unknown or missing value (older server) is ignored. */
export function applyServerTheme(theme: unknown): void {
  if (isTheme(theme)) setTheme(theme);
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current theme; re-renders the component when it changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, getTheme);
}
