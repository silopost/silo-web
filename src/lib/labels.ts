import type { Label } from "../api/types";
import type { IconName } from "../components/Icon";

export type SystemView = {
  /** URL segment: /u/0/<slug> */
  slug: string;
  /** API label id; undefined = all mail. */
  labelId: string | undefined;
  name: string;
  icon: IconName;
  /** Counter shown in LeftNav, as in Gmail. */
  count?: "unread" | "total";
  /** Listed under "Więcej". */
  more?: boolean;
};

/** System labels of plan 5.5 as LeftNav entries (plan 6.3). */
export const SYSTEM_VIEWS: SystemView[] = [
  { slug: "inbox", labelId: "INBOX", name: "Odebrane", icon: "inbox", count: "unread" },
  { slug: "starred", labelId: "STARRED", name: "Oznaczone gwiazdką", icon: "star" },
  { slug: "snoozed", labelId: "SNOOZED", name: "Odłożone", icon: "schedule" },
  { slug: "important", labelId: "IMPORTANT", name: "Ważne", icon: "important" },
  { slug: "sent", labelId: "SENT", name: "Wysłane", icon: "send" },
  {
    slug: "scheduled",
    labelId: "SCHEDULED",
    name: "Zaplanowane",
    icon: "scheduleSend",
    count: "total",
  },
  { slug: "drafts", labelId: "DRAFT", name: "Wersje robocze", icon: "draft", count: "total" },
  { slug: "archive", labelId: "ARCHIVE", name: "Archiwum", icon: "archive", more: true },
  { slug: "all", labelId: undefined, name: "Wszystkie", icon: "allMail", more: true },
  { slug: "spam", labelId: "SPAM", name: "Spam", icon: "report", count: "unread", more: true },
  { slug: "trash", labelId: "TRASH", name: "Kosz", icon: "delete", more: true },
];

export type ResolvedLabel =
  { kind: "system"; view: SystemView } | { kind: "label"; labelId: string } | { kind: "unknown" };

/** Maps the $label URL segment to an API label: a system slug or a label id (l_…). */
export function resolveLabelSlug(slug: string): ResolvedLabel {
  const view = SYSTEM_VIEWS.find((v) => v.slug === slug);
  if (view) return { kind: "system", view };
  if (/^l_[0-9a-z]+$/.test(slug)) return { kind: "label", labelId: slug };
  return { kind: "unknown" };
}

/** System labels and the UNREAD pseudo label have their key as id; others are l_ ids. */
export function isSystemLabelId(id: string): boolean {
  return !id.startsWith("l_");
}

export function viewName(slug: string, labels: Label[]): string {
  const r = resolveLabelSlug(slug);
  if (r.kind === "system") return r.view.name;
  if (r.kind === "label") return labels.find((l) => l.id === r.labelId)?.name ?? slug;
  return slug;
}
