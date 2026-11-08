import { t } from "../lib/i18n";

/** Keyboard shortcuts (plan 6.6); the single source for the dispatcher and the `?` dialog. */
export type ShortcutId =
  | "compose"
  | "composeMaximized"
  | "search"
  | "help"
  | "next"
  | "prev"
  | "open"
  | "back"
  | "select"
  | "star"
  | "archive"
  | "trash"
  | "spam"
  | "markRead"
  | "markUnread"
  | "snooze"
  | "reply"
  | "replyAll"
  | "forward"
  | "undo"
  | "goInbox"
  | "goStarred"
  | "goSent"
  | "goDrafts"
  | "goAll"
  | "selectAll"
  | "selectNone"
  | "selectRead"
  | "selectUnread"
  | "selectStarred"
  | "selectUnstarred"
  | "nextMessage"
  | "prevMessage"
  | "label"
  | "move"
  | "goLabel"
  | `goAccount${AccountDigit}`
  | "send"
  | "close";

type AccountDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Shortcut = {
  id: ShortcutId;
  /** event.key values; two entries = a sequence with a prefix (`g i`, `* a`). */
  keys: string[];
  scope: "global" | "list" | "thread" | "list, thread" | "compose" | "everywhere";
  /**
   * Handled by the component itself (compose window, SearchBox, dialogs, popovers): works in
   * fields and whatever keyboardShortcutsEnabled says; useGlobalShortcuts does not dispatch it.
   */
  component?: true;
};

export const KEYMAP: Shortcut[] = [
  { id: "compose", keys: ["c"], scope: "global" },
  {
    id: "composeMaximized",
    keys: ["C"],
    scope: "global",
  },
  { id: "search", keys: ["/"], scope: "global" },
  { id: "help", keys: ["?"], scope: "global" },
  { id: "undo", keys: ["z"], scope: "global" },
  { id: "next", keys: ["j"], scope: "list, thread" },
  { id: "prev", keys: ["k"], scope: "list, thread" },
  { id: "open", keys: ["o"], scope: "list" },
  { id: "open", keys: ["Enter"], scope: "list" },
  { id: "back", keys: ["u"], scope: "thread" },
  { id: "select", keys: ["x"], scope: "list" },
  { id: "star", keys: ["s"], scope: "list, thread" },
  { id: "archive", keys: ["e"], scope: "list, thread" },
  { id: "trash", keys: ["#"], scope: "list, thread" },
  { id: "spam", keys: ["!"], scope: "list, thread" },
  {
    id: "markRead",
    keys: ["I"],
    scope: "list, thread",
  },
  {
    id: "markUnread",
    keys: ["U"],
    scope: "list, thread",
  },
  { id: "nextMessage", keys: ["n"], scope: "thread" },
  { id: "prevMessage", keys: ["p"], scope: "thread" },
  { id: "label", keys: ["l"], scope: "list, thread" },
  { id: "move", keys: ["v"], scope: "list, thread" },
  { id: "snooze", keys: ["b"], scope: "list, thread" },
  { id: "reply", keys: ["r"], scope: "thread" },
  { id: "replyAll", keys: ["a"], scope: "thread" },
  { id: "forward", keys: ["f"], scope: "thread" },
  { id: "goInbox", keys: ["g", "i"], scope: "global" },
  { id: "goStarred", keys: ["g", "s"], scope: "global" },
  { id: "goSent", keys: ["g", "t"], scope: "global" },
  { id: "goDrafts", keys: ["g", "d"], scope: "global" },
  { id: "goAll", keys: ["g", "a"], scope: "global" },
  { id: "goLabel", keys: ["g", "l"], scope: "global" },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n): Shortcut => ({
    id: `goAccount${n}`,
    keys: ["g", String(n)],
    scope: "global",
  })),
  { id: "selectAll", keys: ["*", "a"], scope: "list" },
  { id: "selectNone", keys: ["*", "n"], scope: "list" },
  { id: "selectRead", keys: ["*", "r"], scope: "list" },
  { id: "selectUnread", keys: ["*", "u"], scope: "list" },
  { id: "selectStarred", keys: ["*", "s"], scope: "list" },
  { id: "selectUnstarred", keys: ["*", "t"], scope: "list" },
  {
    id: "send",
    keys: ["Ctrl+Enter"],
    scope: "compose",
    component: true,
  },
  {
    id: "close",
    keys: ["Escape"],
    scope: "everywhere",
    component: true,
  },
];

/** Every shortcut id but goAccountN has its own text in the dictionaries. */
type LabelledId = Exclude<ShortcutId, `goAccount${AccountDigit}`>;

/** The text of a shortcut in the `?` dialog, in the UI language. */
export function shortcutLabel(s: Shortcut): string {
  const account = /^goAccount(d)$/.exec(s.id);
  if (account) return t.goAccountShortcut(Number(account[1]));
  return t.shortcutLabels[s.id as LabelledId];
}

const DISPATCHED = KEYMAP.filter((s) => !s.component);

export const SINGLES = new Map(
  DISPATCHED.filter((s) => s.keys.length === 1).map((s) => [s.keys[0]!, s.id]),
);

export const SEQUENCES = new Map<string, Map<string, ShortcutId>>();
for (const s of DISPATCHED) {
  if (s.keys.length !== 2) continue;
  const [prefix, key] = s.keys as [string, string];
  if (!SEQUENCES.has(prefix)) SEQUENCES.set(prefix, new Map());
  SEQUENCES.get(prefix)!.set(key, s.id);
}
