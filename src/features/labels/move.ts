import type { ThreadAction } from "../../api/mutations/threads";
import type { Label } from "../../api/types";
import type { IconName } from "../../components/Icon";
import { SYSTEM_VIEWS } from "../../lib/labels";

export type MoveTarget = "INBOX" | "ARCHIVE" | "TRASH" | "SPAM" | Label;

/** The system places of "Move to", in menu order (toolbar popover and row menu). */
export const SYSTEM_TARGETS: { id: "INBOX" | "ARCHIVE" | "TRASH" | "SPAM"; icon: IconName }[] = [
  { id: "INBOX", icon: "inbox" },
  { id: "ARCHIVE", icon: "archive" },
  { id: "SPAM", icon: "report" },
  { id: "TRASH", icon: "delete" },
];

/** Name of a system place: the name of its view, in the current language. */
export const systemTargetName = (id: (typeof SYSTEM_TARGETS)[number]["id"]) =>
  SYSTEM_VIEWS.find((v) => v.labelId === id)?.name ?? id;
/** The modify call of a move: system places map to the usual actions (plan 5.5). */
export type MoveCommand = { action: ThreadAction; add?: string[]; remove?: string[] };

/**
 * "Move to" (`v`, plan 6.6). A folder label is a folder change in the Gmail model (the
 * server moves the messages after the undo window): the target is added, INBOX and the other
 * folder labels the threads carry are removed.
 */
export function moveCommand(
  target: MoveTarget,
  threads: { labelIds: string[] }[],
  folders: Label[],
): MoveCommand {
  const has = (id: string) => threads.some((th) => th.labelIds.includes(id));
  if (target === "INBOX")
    return { action: has("TRASH") ? "untrash" : has("SPAM") ? "notSpam" : "inbox" };
  if (target === "ARCHIVE") return { action: "archive" };
  if (target === "TRASH") return { action: "trash" };
  if (target === "SPAM") return { action: "spam" };
  const others = folders.filter((f) => f.id !== target.id && has(f.id)).map((f) => f.id);
  return {
    action: "labels",
    add: [target.id],
    remove: has("INBOX") ? ["INBOX", ...others] : others,
  };
}
