import type { Locale as DateFnsLocale } from "date-fns";
import { enUS, pl as plDates } from "date-fns/locale";
import { useSyncExternalStore } from "react";
import { en, type Messages } from "./messages/en";
import { pl } from "./messages/pl";

export type { Messages } from "./messages/en";

/** UI languages of silo-web: the enum of settings.language (silo-server), English first. */
export const LOCALES = ["en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Names of the languages in their own language, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", pl: "Polski" };

const DICTIONARIES: Record<Locale, Messages> = { en, pl };
const INTL: Record<Locale, string> = { en: "en-US", pl: "pl-PL" };
const DATE_FNS: Record<Locale, DateFnsLocale> = { en: enUS, pl: plDates };

/** The last language of this browser: the login screen uses it before there is a session. */
export const LOCALE_STORAGE_KEY = "silo.language";

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

function storedLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

let current: Locale = storedLocale();
const listeners = new Set<() => void>();

function applyDocument(locale: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}
applyDocument(current);

export function getLocale(): Locale {
  return current;
}

/**
 * Switches the UI language at once (no reload): the components re-render through useLocale
 * (App remounts the router under a key), module code reads `t` / getT() on its next call.
 * The choice is remembered in localStorage for the next login screen.
 */
export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode: the language still applies to this page.
  }
  if (locale === current) return;
  current = locale;
  applyDocument(locale);
  for (const l of listeners) l();
}

/** Applies settings.language of the server; an unknown or missing value is ignored. */
export function applyServerLocale(language: unknown): void {
  if (isLocale(language)) setLocale(language);
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current language; re-renders the component when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}

/** The dictionary of the current language for code outside React (toasts, notifications). */
export function getT(): Messages {
  return DICTIONARIES[current];
}

/** The dictionary of the current language; re-renders the component when it changes. */
export function useT(): Messages {
  return DICTIONARIES[useLocale()];
}

/** BCP 47 tag for Intl (numbers, collation) of the current language. */
export function intlLocale(): string {
  return INTL[current];
}

/** date-fns locale (month and day names) of the current language. */
export function dateFnsLocale(): DateFnsLocale {
  return DATE_FNS[current];
}

/**
 * UI strings of the current language. Every property read goes to the current dictionary, so
 * `t.inboxTitle` in a component or a module function is always in the language set last;
 * keep reads inside functions (never in module-level constants).
 */
export const t: Messages = new Proxy({} as Messages, {
  get: (_, key) => Reflect.get(DICTIONARIES[current], key),
  has: (_, key) => Reflect.has(DICTIONARIES[current], key),
  ownKeys: () => Reflect.ownKeys(DICTIONARIES[current]),
  getOwnPropertyDescriptor: (_, key) => {
    const d = Reflect.getOwnPropertyDescriptor(DICTIONARIES[current], key);
    return d && { ...d, configurable: true };
  },
});
