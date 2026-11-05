import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ThreadAction } from "../../api/mutations/threads";
import { useLabels } from "../../api/queries/labels";
import { threadQuery, threadsQuery } from "../../api/queries/threads";
import type { Thread } from "../../api/types";
import { t } from "../../lib/i18n";
import { useShortcutHandlers } from "../../shortcuts/useShortcuts";
import { ROW_HEIGHT, usePrefs, useUi } from "../../state/ui";
import { useResync } from "../sync/useSync";
import { actionsForView, type ListContext } from "./listContext";
import { ListToolbar } from "./ListToolbar";
import { selectIds, type SelectKind } from "./selection";
import { ThreadRow } from "./ThreadRow";
import { useThreadCommands } from "./useThreadCommands";

const PREFETCH_DELAY_MS = 150;
const LOAD_MORE_THRESHOLD = 10;
const empty: Thread[] = [];

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
  const actions = actionsForView(ctx.filter);

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
  const onSelect = (kind: SelectKind) => setSelection(selectIds(rows, kind));

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
  });

  // The focused row is the tab stop of the grid (roving tabindex, plan 6.7).
  const tabStop = focusedIndex >= 0 ? focusedId : rows[0]?.id;

  return (
    <section aria-label={ctx.title} className="flex min-h-0 flex-1 flex-col">
      <ListToolbar
        accountId={ctx.accountId}
        rows={rows}
        selection={selection}
        actions={actions}
        total={total}
        refreshing={resync.isPending || list.isRefetching}
        onSelect={onSelect}
        onAction={onAction}
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
        {list.isError && (
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
                  style={{ transform: `translateY(${item.start}px)` }}
                  selected={selection.has(row.id)}
                  focused={row.id === tabStop}
                  labels={labels}
                  viewLabelId={ctx.filter.labelId}
                  hoverActions={actions}
                  onOpen={ctx.openThread}
                  onToggleSelect={toggleSelected}
                  onFocus={setFocused}
                  onAction={onRowAction}
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
    </section>
  );
}
