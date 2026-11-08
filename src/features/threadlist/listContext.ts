import type { ListFilter } from "../../api/keys";
import type { ThreadAction } from "../../api/mutations/threads";

/** What the list and thread views need from their route. */
export type ListContext = {
  accountId: string;
  filter: ListFilter;
  /** Heading of the view. */
  title: string;
  openThread: (id: string) => void;
  backToList: () => void;
};

/** Folder actions offered in a view (Gmail: Trash and Spam offer restore and delete forever). */
export function actionsForLabels(labelIds: string[]): ThreadAction[] {
  if (labelIds.includes("TRASH")) return ["untrash", "deleteForever"];
  if (labelIds.includes("SPAM")) return ["notSpam", "deleteForever"];
  if (labelIds.includes("INBOX")) return ["archive", "trash", "spam"];
  return ["inbox", "trash", "spam"];
}

export function actionsForView(filter: ListFilter): ThreadAction[] {
  if (filter.q !== undefined || filter.labelId === undefined) return ["archive", "trash", "spam"];
  if (filter.labelId === "ARCHIVE") return ["inbox", "trash", "spam"];
  // Scheduled messages are not in a mailbox folder yet; their row offers "Cancel send".
  if (filter.labelId === "SCHEDULED") return [];
  if (filter.labelId === "TRASH" || filter.labelId === "SPAM") {
    return actionsForLabels([filter.labelId]);
  }
  return ["archive", "trash", "spam"];
}

/** Views whose rows can be snoozed (Gmail: not Trash, Spam, Drafts or Scheduled). */
export function canSnoozeView(filter: ListFilter): boolean {
  return !["TRASH", "SPAM", "DRAFT", "SCHEDULED"].includes(filter.labelId ?? "");
}
