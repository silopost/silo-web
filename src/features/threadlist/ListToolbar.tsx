import type { ThreadAction } from "../../api/mutations/threads";
import type { Thread } from "../../api/types";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { LabelsPopover } from "../labels/LabelsPopover";
import { MovePopover } from "../labels/MovePopover";
import { ACTION_META } from "./actionMeta";
import { SelectMenu } from "./SelectMenu";
import type { SelectKind } from "./selection";

type Props = {
  accountId: string;
  rows: Thread[];
  selection: ReadonlySet<string>;
  actions: ThreadAction[];
  total: number;
  refreshing: boolean;
  onSelect: (kind: SelectKind) => void;
  onAction: (action: ThreadAction, ids: string[], add?: string[], remove?: string[]) => void;
  onRefresh: () => void;
  snoozable: boolean;
  /** Opens the snooze picker for the selected threads, anchored at the button. */
  onSnooze: (ids: string[], anchor: HTMLElement) => void;
  /** Popover opened by the `l` / `v` shortcuts. */
  popover?: "labels" | "move" | null;
  onPopoverChange?: (popover: "labels" | "move" | null) => void;
};

/** Selection, actions for the selected threads, refresh and range (plan 6.3). */
export function ListToolbar(p: Props) {
  const selected = p.rows.filter((r) => p.selection.has(r.id));
  const ids = selected.map((r) => r.id);
  const anyUnread = selected.some((r) => r.unreadCount > 0);

  return (
    <div role="toolbar" aria-label={t.threadList} className="flex h-12 items-center gap-1 px-2">
      <SelectMenu total={p.rows.length} selected={ids.length} onSelect={p.onSelect} />
      {ids.length === 0 ? (
        <IconButton
          icon="refresh"
          label={t.refresh}
          onClick={p.onRefresh}
          disabled={p.refreshing}
        />
      ) : (
        <>
          {p.actions.map((a) => {
            const meta = ACTION_META[a as keyof typeof ACTION_META];
            return (
              <IconButton
                key={a}
                icon={meta.icon}
                label={meta.label}
                onClick={() => p.onAction(a, ids)}
              />
            );
          })}
          <IconButton
            icon={anyUnread ? "markRead" : "markUnread"}
            label={anyUnread ? t.markRead : t.markUnread}
            onClick={() => p.onAction(anyUnread ? "read" : "unread", ids)}
          />
          {p.snoozable && (
            <IconButton
              icon="schedule"
              label={t.snooze}
              onClick={(e) => p.onSnooze(ids, e.currentTarget)}
            />
          )}
          <LabelsPopover
            accountId={p.accountId}
            threads={selected.map((r) => ({ id: r.id, labelIds: r.labelIds ?? [] }))}
            onChange={(add, remove) => p.onAction("labels", ids, add, remove)}
            open={p.popover === "labels"}
            onOpenChange={(open) => p.onPopoverChange?.(open ? "labels" : null)}
          />
          <MovePopover
            accountId={p.accountId}
            threads={selected.map((r) => ({ id: r.id, labelIds: r.labelIds ?? [] }))}
            onMove={(c) => p.onAction(c.action, ids, c.add, c.remove)}
            open={p.popover === "move"}
            onOpenChange={(open) => p.onPopoverChange?.(open ? "move" : null)}
          />
        </>
      )}
      {p.rows.length > 0 && (
        <span className="ml-auto pr-2 text-xs text-ink-muted">
          {t.range(1, p.rows.length, Math.max(p.total, p.rows.length))}
        </span>
      )}
    </div>
  );
}
