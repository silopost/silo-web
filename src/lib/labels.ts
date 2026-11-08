import type { Label } from "../api/types";
import type { IconName } from "../components/Icon";
import { t } from "./i18n";

export type SystemView = {
  /** URL segment: /u/0/<slug> */
  slug: string;
  /** API label id; undefined = all mail. */
  labelId: string | undefined;
  /** Display name in the UI language (t.views). */
  readonly name: string;
  icon: IconName;
  /** Counter shown in LeftNav, as in Gmail. */
  count?: "unread" | "total";
  /** Listed under "More". */
  more?: boolean;
};

type ViewSlug = keyof typeof t.views;

/** A system view whose name follows the UI language. */
const view = (v: Omit<SystemView, "name"> & { slug: ViewSlug }): SystemView => ({
  ...v,
  get name() {
    return t.views[v.slug];
  },
});

/** System labels of plan 5.5 as LeftNav entries (plan 6.3). */
export const SYSTEM_VIEWS: SystemView[] = (
  [
    { slug: "inbox", labelId: "INBOX", icon: "inbox", count: "unread" },
    { slug: "starred", labelId: "STARRED", icon: "star" },
    { slug: "snoozed", labelId: "SNOOZED", icon: "schedule", count: "total" },
    { slug: "important", labelId: "IMPORTANT", icon: "important" },
    { slug: "sent", labelId: "SENT", icon: "send" },
    {
      slug: "scheduled",
      labelId: "SCHEDULED",
      icon: "scheduleSend",
      count: "total",
    },
    { slug: "drafts", labelId: "DRAFT", icon: "draft", count: "total" },
    { slug: "archive", labelId: "ARCHIVE", icon: "archive", more: true },
    { slug: "all", labelId: undefined, icon: "allMail", more: true },
    { slug: "spam", labelId: "SPAM", icon: "report", count: "unread", more: true },
    { slug: "trash", labelId: "TRASH", icon: "delete", more: true },
  ] satisfies (Omit<SystemView, "name"> & { slug: ViewSlug })[]
).map(view);

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
