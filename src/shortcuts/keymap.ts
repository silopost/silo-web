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
  label: string;
  scope: "global" | "list" | "thread" | "list, thread" | "compose" | "everywhere";
  /**
   * Handled by the component itself (compose window, SearchBox, dialogs, popovers): works in
   * fields and whatever keyboardShortcutsEnabled says; useGlobalShortcuts does not dispatch it.
   */
  component?: true;
};

export const KEYMAP: Shortcut[] = [
  { id: "compose", keys: ["c"], label: "Nowa wiadomość", scope: "global" },
  {
    id: "composeMaximized",
    keys: ["C"],
    label: "Nowa wiadomość na pełnym ekranie (Shift+C)",
    scope: "global",
  },
  { id: "search", keys: ["/"], label: "Szukaj", scope: "global" },
  { id: "help", keys: ["?"], label: "Lista skrótów", scope: "global" },
  { id: "undo", keys: ["z"], label: "Cofnij ostatnią akcję", scope: "global" },
  { id: "next", keys: ["j"], label: "Następny wątek", scope: "list, thread" },
  { id: "prev", keys: ["k"], label: "Poprzedni wątek", scope: "list, thread" },
  { id: "open", keys: ["o"], label: "Otwórz wątek", scope: "list" },
  { id: "open", keys: ["Enter"], label: "Otwórz wątek", scope: "list" },
  { id: "back", keys: ["u"], label: "Wróć do listy", scope: "thread" },
  { id: "select", keys: ["x"], label: "Zaznacz wątek", scope: "list" },
  { id: "star", keys: ["s"], label: "Gwiazdka", scope: "list, thread" },
  { id: "archive", keys: ["e"], label: "Archiwizuj", scope: "list, thread" },
  { id: "trash", keys: ["#"], label: "Do kosza", scope: "list, thread" },
  { id: "spam", keys: ["!"], label: "Zgłoś spam", scope: "list, thread" },
  {
    id: "markRead",
    keys: ["I"],
    label: "Oznacz jako przeczytane (Shift+I)",
    scope: "list, thread",
  },
  {
    id: "markUnread",
    keys: ["U"],
    label: "Oznacz jako nieprzeczytane (Shift+U)",
    scope: "list, thread",
  },
  { id: "nextMessage", keys: ["n"], label: "Następna wiadomość w wątku", scope: "thread" },
  { id: "prevMessage", keys: ["p"], label: "Poprzednia wiadomość w wątku", scope: "thread" },
  { id: "label", keys: ["l"], label: "Etykietuj", scope: "list, thread" },
  { id: "move", keys: ["v"], label: "Przenieś do folderu", scope: "list, thread" },
  { id: "snooze", keys: ["b"], label: "Odłóż", scope: "list, thread" },
  { id: "reply", keys: ["r"], label: "Odpowiedz", scope: "thread" },
  { id: "replyAll", keys: ["a"], label: "Odpowiedz wszystkim", scope: "thread" },
  { id: "forward", keys: ["f"], label: "Przekaż", scope: "thread" },
  { id: "goInbox", keys: ["g", "i"], label: "Idź do: Odebrane", scope: "global" },
  { id: "goStarred", keys: ["g", "s"], label: "Idź do: Oznaczone gwiazdką", scope: "global" },
  { id: "goSent", keys: ["g", "t"], label: "Idź do: Wysłane", scope: "global" },
  { id: "goDrafts", keys: ["g", "d"], label: "Idź do: Wersje robocze", scope: "global" },
  { id: "goAll", keys: ["g", "a"], label: "Idź do: Wszystkie", scope: "global" },
  { id: "goLabel", keys: ["g", "l"], label: "Idź do: etykieta lub folder", scope: "global" },
  ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((n): Shortcut => ({
    id: `goAccount${n}`,
    keys: ["g", String(n)],
    label: `Idź do konta nr ${n} (kolejność kont)`,
    scope: "global",
  })),
  { id: "selectAll", keys: ["*", "a"], label: "Zaznacz wszystkie", scope: "list" },
  { id: "selectNone", keys: ["*", "n"], label: "Odznacz wszystkie", scope: "list" },
  { id: "selectRead", keys: ["*", "r"], label: "Zaznacz przeczytane", scope: "list" },
  { id: "selectUnread", keys: ["*", "u"], label: "Zaznacz nieprzeczytane", scope: "list" },
  { id: "selectStarred", keys: ["*", "s"], label: "Zaznacz z gwiazdką", scope: "list" },
  { id: "selectUnstarred", keys: ["*", "t"], label: "Zaznacz bez gwiazdki", scope: "list" },
  {
    id: "send",
    keys: ["Ctrl+Enter"],
    label: "Wyślij (⌘+Enter na macOS)",
    scope: "compose",
    component: true,
  },
  {
    id: "close",
    keys: ["Escape"],
    label: "Zamknij okno lub menu, wyjdź z pola wyszukiwania",
    scope: "everywhere",
    component: true,
  },
];

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
