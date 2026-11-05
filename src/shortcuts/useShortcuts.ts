import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useAccountIndex, useActiveAccount } from "../features/account";
import { openNewCompose } from "../features/compose/actions";
import { useToasts } from "../state/toasts";
import { useUi } from "../state/ui";
import { SEQUENCES, SINGLES, type ShortcutId } from "./keymap";

type Handlers = Partial<Record<ShortcutId, () => void>>;

/** Handler layers: the app registers global ones, the list or thread view its own on top. */
const layers: { current: Handlers }[] = [];

export function dispatchShortcut(id: ShortcutId): boolean {
  for (let i = layers.length - 1; i >= 0; i--) {
    const handler = layers[i]!.current[id];
    if (handler) {
      handler();
      return true;
    }
  }
  return false;
}

/** Registers handlers while the calling component is mounted; the latest render wins. */
export function useShortcutHandlers(handlers: Handlers): void {
  const ref = useRef(handlers);
  useLayoutEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    const layer = ref;
    layers.push(layer);
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    };
  }, []);
}

const PREFIX_TIMEOUT_MS = 1500;
const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Events that must not trigger shortcuts (plan 6.6): typing in fields or contenteditable, IME
 * composition, Ctrl/Alt/Meta combinations and keys inside dialogs, which have their own keys.
 */
export function isIgnored(e: KeyboardEvent): boolean {
  const target = e.target instanceof Element ? e.target : null;
  if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return true;
  if (!target) return false;
  if (TEXT_TAGS.has(target.tagName) || (target as HTMLElement).isContentEditable) return true;
  if (target.closest("[role=dialog], [role=menu], [role=alertdialog]")) return true;
  // Enter on a control activates the control, not "open thread".
  if (e.key === "Enter" && target.closest("button, a, [role=menuitem]")) return true;
  return false;
}

/**
 * The app's keyboard: sequences (`g i`, `* a`) by our own listener, single keys by
 * react-hotkeys-hook, both dispatched to the registered handlers. Keys by event.key, so `#`,
 * `!`, `?` and `*` work on the Polish layout.
 */
export function useGlobalShortcuts(): void {
  const navigate = useNavigate();
  const account = useAccountIndex();
  const accountId = useActiveAccount()?.id;
  const qc = useQueryClient();
  const setPrefix = useUi((s) => s.setPendingPrefix);

  const go = (label: string) => () =>
    void navigate({ to: "/u/$account/$label", params: { account, label } });

  useShortcutHandlers({
    compose: () => void openNewCompose(qc, accountId),
    composeMaximized: () => void openNewCompose(qc, accountId, true),
    search: () => document.getElementById("search-input")?.focus(),
    help: () => useUi.getState().setShortcutsHelpOpen(true),
    undo: () => useToasts.getState().lastUndo?.(),
    goInbox: go("inbox"),
    goStarred: go("starred"),
    goSent: go("sent"),
    goDrafts: go("drafts"),
    goAll: go("all"),
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isIgnored(e)) return;
      const pending = useUi.getState().pendingPrefix;
      if (pending) {
        clearTimeout(timer);
        setPrefix(null);
        e.preventDefault();
        const id = SEQUENCES.get(pending)?.get(e.key);
        if (id) dispatchShortcut(id);
        return;
      }
      if (SEQUENCES.has(e.key)) {
        e.preventDefault();
        setPrefix(e.key);
        timer = setTimeout(() => setPrefix(null), PREFIX_TIMEOUT_MS);
      }
    };
    // Capture phase: runs before the single-key listener, which skips consumed events.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [setPrefix]);

  useHotkeys(
    [...new Set([...SINGLES.keys()].map((k) => k.toLowerCase()))],
    (e) => {
      const id = SINGLES.get(e.key);
      if (id && dispatchShortcut(id)) e.preventDefault();
    },
    {
      useKey: true,
      ignoreModifiers: true,
      ignoreEventWhen: (e) => e.defaultPrevented || isIgnored(e),
    },
  );
}
