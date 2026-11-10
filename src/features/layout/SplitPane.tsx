import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { t } from "../../lib/i18n";
import { isIgnored, ShortcutScopeContext } from "../../shortcuts/useShortcuts";
import { usePrefs, useUi } from "../../state/ui";

/** Below this width the split modes fall back to "none" (the preference stays as it is). */
const WIDE_QUERY = "(min-width: 1024px)";

type Split = "vertical" | "horizontal";

/** Smallest list and thread pane, in px along the split direction. */
const MIN_LIST: Record<Split, number> = { vertical: 320, horizontal: 120 };
const MIN_PANE: Record<Split, number> = { vertical: 360, horizontal: 160 };
/** Arrow-key step of the divider, as a share of the split. */
const KEY_STEP = 0.02;

function subscribeWide(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** jsdom and old browsers have no matchMedia: treat them as wide. */
const isWide = () =>
  typeof window.matchMedia !== "function" || window.matchMedia(WIDE_QUERY).matches;

function useWideViewport(): boolean {
  return useSyncExternalStore(subscribeWide, isWide, () => true);
}

/** Keeps both panes above their minimum size; `total` is the split's length in px. */
function clampSize(size: number, total: number, split: Split): number {
  if (total <= 0) return Math.min(Math.max(size, 0.1), 0.9);
  const min = MIN_LIST[split] / total;
  const max = 1 - MIN_PANE[split] / total;
  if (min > max) return 0.5;
  return Math.min(Math.max(size, min), max);
}

type Props = {
  /** The thread list. */
  list: ReactNode;
  /** The open thread (the child route); shown in the pane while `open`. */
  pane: ReactNode;
  open: boolean;
  /** Closes the thread (navigates to the list route); the list stays. */
  onClose: () => void;
};

/**
 * Reading pane of the list views (Gmail): with "none" the open thread replaces the list, as it
 * always did; with a split both are shown, separated by a draggable divider. Keyboard: the pane
 * holding the focus answers the shortcuts first (thread pane → thread scope, anywhere else →
 * list scope); keys only the other pane knows still reach it (`u`, `r` from the list).
 */
export function SplitPane({ list, pane, open, onClose }: Props) {
  const mode = usePrefs((s) => s.readingPane);
  const sizes = usePrefs((s) => s.paneSizes);
  const setPaneSize = usePrefs((s) => s.setPaneSize);
  const wide = useWideViewport();
  const split: Split | null = wide && mode !== "none" ? mode : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [dragSize, setDragSize] = useState<number | null>(null);

  const inPane = useCallback(() => !!paneRef.current?.contains(document.activeElement), []);
  const outsidePane = useCallback(() => !inPane(), [inPane]);

  // Closing the pane drops the focus with it: give it back to the list's cursor row.
  const wasOpen = useRef(open);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed || !split) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== paneRef.current) return;
    const id = useUi.getState().focusedThreadId;
    const rows = listRef.current;
    const row =
      (id && rows?.querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(id)}"]`)) ||
      rows?.querySelector<HTMLElement>('[role="row"][tabindex="0"]');
    row?.focus();
  }, [open, split]);

  if (!split) return <>{open ? pane : list}</>;

  const vertical = split === "vertical";
  const length = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? (vertical ? rect.width : rect.height) : 0;
  };
  const size = dragSize ?? sizes[split];

  const sizeAt = (e: PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return size;
    const raw = vertical
      ? (e.clientX - rect.left) / rect.width
      : (e.clientY - rect.top) / rect.height;
    return clampSize(raw, vertical ? rect.width : rect.height, split);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragSize(size);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragSize !== null) setDragSize(sizeAt(e));
  };
  const endDrag = () => {
    if (dragSize === null) return;
    setPaneSize(split, dragSize);
    setDragSize(null);
  };
  const onSeparatorKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const less = vertical ? "ArrowLeft" : "ArrowUp";
    const more = vertical ? "ArrowRight" : "ArrowDown";
    let next: number | null = null;
    if (e.key === less) next = size - KEY_STEP;
    else if (e.key === more) next = size + KEY_STEP;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    if (next === null) return;
    e.preventDefault();
    setPaneSize(split, clampSize(next, length(), split));
  };
  // Esc closes the open thread, like `u` (keys of fields, menus and dialogs stay theirs).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !open || e.defaultPrevented || isIgnored(e.nativeEvent)) return;
    e.preventDefault();
    onClose();
  };

  const listMin = vertical ? { minWidth: MIN_LIST.vertical } : { minHeight: MIN_LIST.horizontal };
  const paneMin = vertical ? { minWidth: MIN_PANE.vertical } : { minHeight: MIN_PANE.horizontal };

  return (
    <div
      ref={containerRef}
      data-reading-pane={split}
      onKeyDown={onKeyDown}
      className={`flex min-h-0 min-w-0 flex-1 ${vertical ? "flex-row" : "flex-col"}`}
    >
      <div
        ref={listRef}
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        style={{ flex: `0 0 ${size * 100}%`, ...listMin }}
      >
        <ShortcutScopeContext.Provider value={inPane}>{list}</ShortcutScopeContext.Provider>
      </div>
      <div
        role="separator"
        aria-orientation={vertical ? "vertical" : "horizontal"}
        aria-label={t.readingPaneResize}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(size * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onSeparatorKey}
        className={`shrink-0 touch-none outline-none hover:bg-primary focus-visible:bg-primary ${
          vertical ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
        } ${dragSize !== null ? "bg-primary" : "bg-line"}`}
      />
      {/* tabIndex -1: a click on the thread's text focuses the pane, so its keys answer. */}
      <div
        ref={paneRef}
        tabIndex={-1}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none"
        style={paneMin}
      >
        <ShortcutScopeContext.Provider value={outsidePane}>
          {open ? (
            pane
          ) : (
            <p className="m-auto p-6 text-center text-ink-muted">{t.noThreadSelected}</p>
          )}
        </ShortcutScopeContext.Provider>
      </div>
    </div>
  );
}
