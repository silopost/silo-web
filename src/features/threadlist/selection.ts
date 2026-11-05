import type { Thread } from "../../api/types";

export type SelectKind = "all" | "none" | "read" | "unread" | "starred" | "unstarred";

const isUnread = (th: Thread) => th.unreadCount > 0 || (th.labelIds ?? []).includes("UNREAD");
const isStarred = (th: Thread) => (th.labelIds ?? []).includes("STARRED");

/** Ids of the loaded rows matching a selection kind (SelectMenu, `* a` … `* t`). */
export function selectIds(rows: Thread[], kind: SelectKind): string[] {
  const pick: Record<SelectKind, (th: Thread) => boolean> = {
    all: () => true,
    none: () => false,
    read: (th) => !isUnread(th),
    unread: isUnread,
    starred: isStarred,
    unstarred: (th) => !isStarred(th),
  };
  return rows.filter(pick[kind]).map((th) => th.id);
}
