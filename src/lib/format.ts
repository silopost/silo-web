import { format, isSameDay, isSameYear } from "date-fns";
import type { Address, Participant } from "../api/types";
import { dateFnsLocale, intlLocale, t } from "./i18n";

/** A date in a pattern of t.dateFormats, with the month and day names of the UI language. */
const fmt = (d: Date, pattern: keyof typeof t.dateFormats) =>
  format(d, t.dateFormats[pattern], { locale: dateFnsLocale() });

/**
 * List date as in Gmail (plan 6.1): the time today, day and month this year, the full date
 * otherwise ("9:12 AM", "Nov 4", "11/4/25"; in Polish "09:12", "4 lis", "04.11.2025").
 */
export function formatListDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return fmt(d, "time");
  if (isSameYear(d, now)) return fmt(d, "dayMonth");
  return fmt(d, "date");
}

export function formatFullDate(iso: string): string {
  return fmt(new Date(iso), "full");
}

/** A wake or send time as in Gmail's menus: "Fri, 8:00 AM" (browser time zone). */
export function formatPresetTime(iso: string): string {
  return fmt(new Date(iso), "preset");
}

/** Snooze or send time in snackbars and rows: "Nov 6, 8:00 AM" (browser time zone). */
export function formatSnoozeTime(iso: string): string {
  return fmt(new Date(iso), "snooze");
}

/** Value of a datetime-local field for a time: "2026-11-05T09:30" (minutes). */
export function dateTimeLocalValue(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** The value of a datetime-local field (local time) as RFC 3339; null when empty or invalid. */
export function dateTimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "512 B", "277 KB", "3.0 MB" (decimal separator of the UI language: "3,0 MB" in Polish). */
export function formatSize(bytes: number): string {
  const number = (n: number, digits: number) =>
    n.toLocaleString(intlLocale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  if (bytes < 1024) return `${number(bytes, 0)} B`;
  if (bytes < 1024 * 1024) return `${number(Math.round(bytes / 1024), 0)} KB`;
  return `${number(bytes / (1024 * 1024), 1)} MB`;
}

export function formatCount(n: number): string {
  return n.toLocaleString(intlLocale());
}

export function displayName(a: Pick<Address, "email" | "name">): string {
  if (a.email === "me") return t.me;
  return a.name || a.email;
}

function shortName(p: Participant): string {
  if (p.email === "me") return t.me;
  return p.name ? (p.name.split(/\s+/)[0] ?? p.name) : (p.email.split("@")[0] ?? p.email);
}

/** Senders column: the full name of a single participant, short names of up to three otherwise. */
export function participantNames(list: Participant[]): { name: string; unread: boolean }[] {
  if (list.length === 1) {
    const p = list[0]!;
    return [{ name: displayName(p), unread: p.unread }];
  }
  const shown = list.length > 3 ? [list[0]!, ...list.slice(-2)] : list;
  return shown.map((p) => ({ name: shortName(p), unread: p.unread }));
}

export function initial(a: Pick<Address, "email" | "name">): string {
  return (a.name || a.email).trim().charAt(0).toUpperCase() || "?";
}
