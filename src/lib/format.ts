import { format, isSameDay, isSameYear } from "date-fns";
import { pl } from "date-fns/locale";
import type { Address, Participant } from "../api/types";
import { t } from "./i18n";

/** List date as in Gmail (plan 6.1): "09:12" today, "4 lis" this year, "04.11.2025" otherwise. */
export function formatListDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return format(d, "HH:mm");
  if (isSameYear(d, now)) return format(d, "d MMM", { locale: pl });
  return format(d, "dd.MM.yyyy");
}

export function formatFullDate(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: pl });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("pl-PL");
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
