import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isApiError } from "../../api/errors";
import { snoozeThreads, wakeThread } from "../../api/mutations/snooze";
import type { ThreadAction } from "../../api/mutations/threads";
import { useLabels } from "../../api/queries/labels";
import { threadQuery, threadsQuery } from "../../api/queries/threads";
import type { Thread } from "../../api/types";
import { t } from "../../lib/i18n";
import { useShortcutHandlers } from "../../shortcuts/useShortcuts";
import { ROW_HEIGHT, usePrefs, useUi } from "../../state/ui";
import { undoSend } from "../compose/session";
import { SearchHeader } from "../search/SearchHeader";
import { SnoozeMenu } from "../snooze/PresetTimeMenu";
import { useResync } from "../sync/useSync";
import { actionsForView, canSnoozeView, type ListContext } from "./listContext";
import { ACTION_META } from "./actionMeta";
import { labelState, labelToggle } from "../labels/labelState";
import { moveCommand, SYSTEM_TARGETS, systemTargetName, type MoveCommand } from "../labels/move";
import { ListToolbar } from "./ListToolbar";
import { RowContextMenu, type ContextMenuItem } from "./RowContextMenu";
import { selectIds, type SelectKind } from "./selection";
import { ThreadRow } from "./ThreadRow";
import { useThreadCommands } from "./useThreadCommands";

const PREFETCH_DELAY_MS = 150;
const LOAD_MORE_THRESHOLD = 10;
const empty: Thread[] = [];

type Rect = { left: number; top: number; width: number; height: number };
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** ThreadList (plan 6.3): infinite keyset query, virtual rows, selection, actions, keyboard. */
export function ThreadList({ ctx }: { ctx: ListContext }) {
  const qc = useQueryClient();
  const list = useInfiniteQuery(threadsQuery(ctx.accountId, ctx.filter));
  const rows = useMemo(
    () => list.data?.pages.flatMap((p) => p.threads ?? []) ?? empty,
    [list.data],
  );
  const total = list.data?.pages[0]?.resultSizeEstimate ?? rows.length;
  const labels = useLabels(ctx.accountId);
  const density = usePrefs((s) => s.density);
  const selection = useUi((s) => s.selection);
  const focusedId = useUi((s) => s.focusedThreadId);
  const { setSelection, toggleSelected, setFocused } = useUi.getState();
  const resync = useResync();
  const { run, dialog } = useThreadCommands(ctx.accountId);
  // Stable props keep the memoised rows from re-rendering on every scroll event.
  const actions = useMemo(() => actionsForView(ctx.filter), [ctx.filter]);
  const snoozable = canSnoozeView(ctx.filter);
  const firstPage = list.data?.pages[0];
  const invalidQuery = isApiError(list.error) && list.error.code === "invalid_query";

  // The selection and cursor belong to one list.
  const listKey = JSON.stringify([ctx.accountId, ctx.filter]);
  useEffect(() => {
    useUi.getState().setSelection([]);
  }, [listKey]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // The component is not compiled by React Compiler; the virtualiser re-renders it as needed.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT[density],
    overscan: 10,
    getItemKey: (i) => rows[i]?.id ?? i,
  });
  useEffect(() => virtualizer.measure(), [density, virtualizer]);

  const items = virtualizer.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index ?? -1;
  useEffect(() => {
    if (
      lastIndex >= rows.length - LOAD_MORE_THRESHOLD &&
      list.hasNextPage &&
      !list.isFetchingNextPage
    ) {
      void list.fetchNextPage();
    }
  }, [lastIndex, rows.length, list]);

  // Prefetch the thread after the pointer rests on a row for 150 ms (plan 6.4).
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onHoverIntent = useCallback(
    (id: string) => {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(
        () => void qc.prefetchQuery(threadQuery(id)),
        PREFETCH_DELAY_MS,
      );
    },
    [qc],
  );
  const onHoverEnd = useCallback(() => clearTimeout(hoverTimer.current), []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const focusRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      setFocused(row.id);
      virtualizer.scrollToIndex(index);
      requestAnimationFrame(() =>
        scrollRef.current?.querySelector<HTMLElement>(`[data-thread-id="${row.id}"]`)?.focus(),
      );
    },
    [rows, setFocused, virtualizer],
  );

  const focusedIndex = rows.findIndex((r) => r.id === focusedId);
  const targetIds = () => {
    if (selection.size > 0) return rows.filter((r) => selection.has(r.id)).map((r) => r.id);
    return focusedIndex >= 0 ? [rows[focusedIndex]!.id] : [];
  };

  const onAction = useCallback(
    (action: ThreadAction, ids: string[], add?: string[], remove?: string[]) => {
      run(action, ids, { add, remove });
      if (action !== "star" && action !== "unstar" && action !== "labels") setSelection([]);
    },
    [run, setSelection],
  );
  const onRowAction = useCallback((a: ThreadAction, id: string) => onAction(a, [id]), [onAction]);

  // One snooze picker for the list (row button, toolbar, `b`), anchored where it was opened.
  const [snooze, setSnooze] = useState<{ ids: string[]; rect: Rect } | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const openSnooze = useCallback((ids: string[], anchor: Element | null | undefined) => {
    if (ids.length === 0) return;
    const rect = anchor ? rectOf(anchor) : { left: 0, top: 0, width: 0, height: 0 };
    setSnooze({ ids, rect });
    setSnoozeOpen(true);
  }, []);
  const onRowSnooze = useCallback(
    (id: string, anchor: HTMLElement) => openSnooze([id], anchor),
    [openSnooze],
  );
  const onWake = useCallback(
    (id: string) => void wakeThread(qc, ctx.accountId, id),
    [qc, ctx.accountId],
  );
  const onCancelSend = useCallback(
    (th: Thread) => {
      if (th.outboundId) void undoSend(qc, th.outboundId, ctx.accountId, t.sendCancelled);
    },
    [qc, ctx.accountId],
  );
  const pickSnooze = (until: string) => {
    if (!snooze) return;
    const ids = snooze.ids;
    // The cursor moves on when its row leaves the list, as with archive.
    if (ids.length === 1 && ids[0] === focusedId && ctx.filter.labelId !== "SNOOZED") {
      setFocused(rows[focusedIndex + 1]?.id ?? rows[focusedIndex - 1]?.id ?? null);
    }
    void snoozeThreads(qc, { accountId: ctx.accountId, ids, until });
    if (ids.length > 1) setSelection([]);
  };
  // Right-click menu (Gmail): a selected row acts on the whole selection, any other row on
  // itself alone, leaving the selection as it is.
  const [menu, setMenu] = useState<{
    ids: string[];
    x: number;
    y: number;
    fromSelection: boolean;
  } | null>(null);
  // Set when a pick opens another popup, which then takes the focus instead of the row.
  const menuHandoff = useRef(false);
  const menuRow = useRef<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onRowContextMenu = useCallback(
    (id: string, x: number, y: number) => {
      const sel = useUi.getState().selection;
      const fromSelection = sel.has(id);
      const ids = fromSelection ? rows.filter((r) => sel.has(r.id)).map((r) => r.id) : [id];
      menuHandoff.current = false;
      menuRow.current = id;
      setMenu({ ids, x, y, fromSelection });
    },
    [rows],
  );
  const menuItems = (): ContextMenuItem[] => {
    if (!menu) return [];
    const { ids, fromSelection } = menu;
    const targets = rows.filter((r) => ids.includes(r.id));
    if (targets.length === 0) return [];
    const exec = (a: ThreadAction) => () => {
      if (fromSelection) onAction(a, ids);
      else run(a, ids);
    };
    const meta = (a: ThreadAction) => ACTION_META[a as keyof typeof ACTION_META];
    const anyUnread = targets.some(
      (r) => r.unreadCount > 0 || (r.labelIds ?? []).includes("UNREAD"),
    );
    const allStarred = targets.every((r) => (r.labelIds ?? []).includes("STARRED"));
    const handoff = (open: () => void) => () => {
      menuHandoff.current = true;
      open();
    };
    const items: ContextMenuItem[] = actions.map((a) => ({ key: a, ...meta(a), run: exec(a) }));
    for (const a of [anyUnread ? "read" : "unread", allStarred ? "unstar" : "star"] as const) {
      items.push({ key: a, ...meta(a), run: exec(a) });
    }
    if (snoozable) {
      items.push({
        key: "snooze",
        icon: "schedule",
        label: t.snooze,
        run: handoff(() => {
          setSnooze({ ids, rect: { left: menu.x, top: menu.y, width: 0, height: 0 } });
          setSnoozeOpen(true);
        }),
      });
    }
    // "Move to" and "Label as" are the toolbar popovers as submenus: same targets, same
    // commands (moveCommand, labelToggle), the same mutation with undo and toast.
    const threads = targets.map((r) => ({ labelIds: r.labelIds ?? [] }));
    const move = (c: MoveCommand) => () => {
      if (fromSelection) onAction(c.action, ids, c.add, c.remove);
      else run(c.action, ids, { add: c.add, remove: c.remove });
    };
    if (actions.length > 0) {
      const folders = labels.filter((l) => l.type === "folder");
      items.push({
        kind: "submenu",
        key: "move",
        icon: "moveTo",
        label: t.moveTo,
        items: [
          ...SYSTEM_TARGETS.map((s) => ({
            key: s.id,
            icon: s.icon,
            label: systemTargetName(s.id),
            run: move(moveCommand(s.id, threads, folders)),
          })),
          ...folders.map((f) => ({
            key: f.id,
            icon: "folder" as const,
            label: f.name,
            run: move(moveCommand(f, threads, folders)),
          })),
        ],
      });
    }
    items.push({
      kind: "submenu",
      key: "labels",
      icon: "label",
      label: t.labelAs,
      empty: t.noLabels,
      items: labels
        .filter((l) => l.type === "user")
        .map((l) => {
          const state = labelState(threads, l.id);
          const [add, remove] = labelToggle(state, l.id);
          return {
            kind: "check" as const,
            key: l.id,
            label: l.name,
            checked: state === "some" ? ("indeterminate" as const) : state === "all",
            run: () => run("labels", ids, { add, remove }),
          };
        }),
    });
    return items;
  };
  const onSelect = (kind: SelectKind) => setSelection(selectIds(rows, kind));
  // l / v open the toolbar's popovers; without a selection they act on the cursor row.
  const [popover, setPopover] = useState<"labels" | "move" | null>(null);
  const openPopover = (which: "labels" | "move") => {
    if (selection.size === 0) {
      if (!focusedId) return;
      setSelection([focusedId]);
    }
    setPopover(which);
  };

  const act = (action: ThreadAction) => () => {
    if (!actions.includes(action) && ["archive", "trash", "spam"].includes(action)) return;
    const ids = targetIds();
    // The cursor moves on when its row leaves the list.
    if (selection.size === 0 && focusedIndex >= 0 && action !== "read" && action !== "unread") {
      setFocused(rows[focusedIndex + 1]?.id ?? rows[focusedIndex - 1]?.id ?? null);
    }
    onAction(action, ids);
  };
  useShortcutHandlers({
    label: () => openPopover("labels"),
    move: () => openPopover("move"),
    // Without a cursor the first row is shown as the cursor (tab stop), so j goes to the second.
    next: () => focusRow(Math.min(Math.max(focusedIndex, 0) + 1, rows.length - 1)),
    prev: () => focusRow(Math.max(focusedIndex - 1, 0)),
    open: () => focusedId && ctx.openThread(focusedId),
    select: () => focusedId && toggleSelected(focusedId),
    star: () => {
      const row = rows[focusedIndex];
      if (row) onAction((row.labelIds ?? []).includes("STARRED") ? "unstar" : "star", [row.id]);
    },
    archive: act("archive"),
    trash: act(ctx.filter.labelId === "TRASH" ? "deleteForever" : "trash"),
    spam: act("spam"),
    markRead: act("read"),
    markUnread: act("unread"),
    selectAll: () => onSelect("all"),
    selectNone: () => onSelect("none"),
    selectRead: () => onSelect("read"),
    selectUnread: () => onSelect("unread"),
    selectStarred: () => onSelect("starred"),
    selectUnstarred: () => onSelect("unstarred"),
    snooze: () => {
      if (!snoozable) return;
      const ids = targetIds();
      const anchor =
        (focusedId && scrollRef.current?.querySelector(`[data-thread-id="${focusedId}"]`)) ||
        scrollRef.current;
      openSnooze(ids, anchor);
    },
  });

  // The focused row is the tab stop of the grid (roving tabindex, plan 6.7).
  const tabStop = focusedIndex >= 0 ? focusedId : rows[0]?.id;

  return (
    <section aria-label={ctx.title} className="flex min-h-0 flex-1 flex-col">
      {ctx.filter.q !== undefined && (
        <SearchHeader
          q={ctx.filter.q}
          indexing={firstPage?.indexing}
          approximate={firstPage?.approximate === true}
          estimate={firstPage && !invalidQuery ? firstPage.resultSizeEstimate : undefined}
        />
      )}
      <ListToolbar
        accountId={ctx.accountId}
        snoozable={snoozable}
        onSnooze={openSnooze}
        rows={rows}
        selection={selection}
        actions={actions}
        total={total}
        refreshing={resync.isPending || list.isRefetching}
        onSelect={onSelect}
        onAction={onAction}
        popover={popover}
        onPopoverChange={setPopover}
        onRefresh={() => {
          resync.mutate();
          void list.refetch();
        }}
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending && (
          <p role="status" className="p-6 text-ink-muted">
            {t.loading}
          </p>
        )}
        {list.isError && !invalidQuery && (
          <div role="alert" className="flex items-center gap-3 p-6">
            <span>{t.loadError}</span>
            <button
              type="button"
              className="font-medium text-primary"
              onClick={() => void list.refetch()}
            >
              {t.retry}
            </button>
          </div>
        )}
        {list.isSuccess && rows.length === 0 && (
          <p className="p-6 text-center text-ink-muted">
            {ctx.filter.q !== undefined ? t.emptySearch : t.emptyList}
          </p>
        )}
        {rows.length > 0 && (
          <div
            role="grid"
            aria-label={ctx.title}
            aria-rowcount={Math.max(total, rows.length)}
            aria-multiselectable="true"
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {items.map((item) => {
              const row = rows[item.index]!;
              return (
                <ThreadRow
                  key={row.id}
                  thread={row}
                  index={item.index}
                  start={item.start}
                  selected={selection.has(row.id)}
                  focused={row.id === tabStop}
                  labels={labels}
                  viewLabelId={ctx.filter.labelId}
                  hoverActions={actions}
                  snoozable={snoozable}
                  onSnooze={onRowSnooze}
                  onWake={onWake}
                  onCancelSend={onCancelSend}
                  onOpen={ctx.openThread}
                  onToggleSelect={toggleSelected}
                  onFocus={setFocused}
                  onAction={onRowAction}
                  onContextMenu={onRowContextMenu}
                  onHoverIntent={onHoverIntent}
                  onHoverEnd={onHoverEnd}
                />
              );
            })}
          </div>
        )}
        {list.isFetchingNextPage && <p className="p-3 text-center text-ink-muted">{t.loading}</p>}
      </div>
      {dialog}
      <RowContextMenu
        at={menu && { x: menu.x, y: menu.y }}
        items={menuItems()}
        onClose={closeMenu}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (menuHandoff.current) return;
          // The keyboard cursor goes to the row that was right-clicked.
          const id = menuRow.current;
          if (!id) return;
          scrollRef.current?.querySelector<HTMLElement>(`[data-thread-id="${id}"]`)?.focus();
        }}
      />
      <SnoozeMenu
        open={snoozeOpen}
        onOpenChange={setSnoozeOpen}
        onPick={pickSnooze}
        onCloseAutoFocus={(e) => {
          // The anchor is not focusable: the keyboard cursor (row) takes the focus back.
          e.preventDefault();
          const id = useUi.getState().focusedThreadId;
          if (id)
            scrollRef.current?.querySelector<HTMLElement>(`[data-thread-id="${id}"]`)?.focus();
        }}
        title={
          ctx.filter.labelId === "SNOOZED" && snooze?.ids.length === 1 ? t.changeSnooze : undefined
        }
      >
        <span
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={snooze ? snooze.rect : { left: 0, top: 0 }}
        />
      </SnoozeMenu>
    </section>
  );
}
