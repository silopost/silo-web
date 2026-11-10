import { memo } from "react";
import type { ThreadAction } from "../../api/mutations/threads";
import type { Label, Thread } from "../../api/types";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import {
  formatFullDate,
  formatListDate,
  formatSnoozeTime,
  participantNames,
} from "../../lib/format";
import { t } from "../../lib/i18n";
import { NO_COLOR_BG, NO_COLOR_TEXT } from "../../lib/labelColors";
import { isSystemLabelId } from "../../lib/labels";
import { PendingIcon } from "../sync/PendingIcon";
import { ACTION_META } from "./actionMeta";

type Props = {
  thread: Thread;
  index: number;
  /** Offset of the row in the virtual list (px); a number, so that memo holds while scrolling. */
  start: number;
  selected: boolean;
  focused: boolean;
  labels: Label[];
  /** Label of the view; its chip is not repeated in the rows. */
  viewLabelId: string | undefined;
  hoverActions: ThreadAction[];
  /** Whether the view offers snooze (Inbox, labels, search...; not Trash, Spam, Scheduled). */
  snoozable: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onAction: (action: ThreadAction, id: string) => void;
  onHoverIntent: (id: string) => void;
  onHoverEnd: () => void;
  /** Opens the snooze picker for the row, anchored at the button. */
  onSnooze: (id: string, anchor: HTMLElement) => void;
  /** "Unsnooze" of a snoozed thread. */
  onWake: (id: string) => void;
  /** "Cancel send" of a scheduled message (outboundId of the row). */
  onCancelSend: (thread: Thread) => void;
  /** Right click (or the context menu key) on the row: Gmail-style action menu at x/y. */
  onContextMenu: (id: string, x: number, y: number) => void;
};

function rowLabel(th: Thread, unread: boolean, names: string, date: string): string {
  const when = th.snoozedUntil
    ? t.snoozedUntil(formatSnoozeTime(th.snoozedUntil))
    : th.scheduledAt
      ? t.scheduledFor(formatSnoozeTime(th.scheduledAt))
      : date;
  const drafts = th.draftCount > 0 ? t.draftsMarker(th.draftCount) : null;
  const parts = [unread ? t.unread : null, names, drafts, th.subject || t.noSubject, when];
  if (th.hasAttachments) parts.push(t.hasAttachment);
  if (th.labelIds?.includes("SCHEDULED")) parts.push(t.scheduledLabel);
  if (th.pendingSync) parts.push(t.pendingSync);
  return parts.filter(Boolean).join(", ");
}

/** One row of the list, laid out as in Gmail (plan 6.3). */
export const ThreadRow = memo(function ThreadRow(p: Props) {
  const th = p.thread;
  const labelIds = th.labelIds ?? [];
  const unread = th.unreadCount > 0 || labelIds.includes("UNREAD");
  const starred = labelIds.includes("STARRED");
  const names = participantNames(th.participants ?? []);
  const namesText = names.map((n) => n.name).join(", ");
  const date = formatListDate(th.lastMessageAt);
  const chips = labelIds
    .filter((id) => !isSystemLabelId(id) && id !== p.viewLabelId)
    .map((id) => p.labels.find((l) => l.id === id))
    .filter((l): l is Label => !!l);
  const readAction: ThreadAction = unread ? "read" : "unread";
  const snoozed = !!th.snoozedUntil && labelIds.includes("SNOOZED");
  const scheduled = !!th.scheduledAt && !!th.outboundId;

  return (
    <div
      role="row"
      aria-rowindex={p.index + 1}
      aria-selected={p.selected}
      aria-label={rowLabel(th, unread, namesText, date)}
      tabIndex={p.focused ? 0 : -1}
      data-thread-id={th.id}
      style={{ transform: `translateY(${p.start}px)` }}
      onClick={() => p.onOpen(th.id)}
      onContextMenu={(e) => {
        // Only the rows replace the browser menu.
        e.preventDefault();
        let { clientX: x, clientY: y } = e;
        if (x === 0 && y === 0) {
          // Keyboard (context menu key, Shift+F10): below the start of the row.
          const r = e.currentTarget.getBoundingClientRect();
          x = r.left + 48;
          y = r.bottom;
        }
        p.onContextMenu(th.id, x, y);
      }}
      onFocus={(e) => e.target === e.currentTarget && p.onFocus(th.id)}
      onMouseEnter={() => p.onHoverIntent(th.id)}
      onMouseLeave={p.onHoverEnd}
      className={`group absolute top-0 left-0 flex h-[var(--row-h)] w-full cursor-pointer items-center gap-2 border-b border-line px-[var(--row-px)] hover:z-10 hover:shadow-[inset_1px_0_0_var(--color-row-edge),inset_-1px_0_0_var(--color-row-edge),0_1px_2px_0_var(--color-row-shadow)] focus-visible:z-10 ${
        p.selected ? "bg-row-selected" : unread ? "bg-panel" : "bg-row-read"
      } ${p.focused ? "shadow-[inset_4px_0_0_var(--color-primary)]" : ""}`}
    >
      <div role="gridcell" className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={p.selected}
          onChange={() => p.onToggleSelect(th.id)}
          aria-label={t.selectThread}
          tabIndex={-1}
          className="size-4 accent-primary"
        />
      </div>
      <div role="gridcell" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          tabIndex={-1}
          aria-pressed={starred}
          aria-label={starred ? t.unstar : t.star}
          onClick={() => p.onAction(starred ? "unstar" : "star", th.id)}
          className={`flex size-6 items-center justify-center rounded-full ${starred ? "text-star" : "text-ink-muted"}`}
        >
          <Icon name={starred ? "star" : "starBorder"} size={18} />
        </button>
      </div>
      <div
        role="gridcell"
        className={`flex w-48 shrink-0 items-baseline whitespace-nowrap ${unread ? "font-bold" : ""}`}
      >
        <span className="min-w-0 truncate">
          {names.map((n, i) => (
            <span key={i} className={n.unread ? "font-bold" : unread ? "" : "font-normal"}>
              {i > 0 && ", "}
              {n.name}
            </span>
          ))}
        </span>
        {th.messageCount > 1 && (
          <span className="ml-1 shrink-0 text-xs font-normal text-ink-muted">
            {th.messageCount}
          </span>
        )}
        {th.draftCount > 0 && (
          // Gmail's red "Draft" / "Drafts (n)" after the senders: unsent drafts in the thread.
          <span className="ml-1 shrink-0 font-normal text-draft">
            {t.draftsMarker(th.draftCount)}
          </span>
        )}
      </div>
      <div role="gridcell" className="flex min-w-0 flex-1 items-center gap-1">
        {chips.map((l) => (
          <span
            key={l.id}
            className="shrink-0 rounded px-1.5 text-xs"
            style={{
              backgroundColor: l.colorBg ?? NO_COLOR_BG,
              color: l.colorText ?? NO_COLOR_TEXT,
            }}
          >
            {l.name}
          </span>
        ))}
        {labelIds.includes("SCHEDULED") && (
          <span className="shrink-0 text-ink-muted" title={t.scheduledLabel}>
            <Icon name="schedule" size={16} />
          </span>
        )}
        <span className="truncate">
          <span className={unread ? "font-bold" : ""}>{th.subject || t.noSubject}</span>
          <span className="text-ink-muted"> – {th.snippet}</span>
        </span>
      </div>
      <div role="gridcell" className="flex shrink-0 items-center gap-2">
        <PendingIcon pending={th.pendingSync} />
        {th.hasAttachments && (
          <span className="text-ink-muted" title={t.hasAttachment}>
            <Icon name="attach" size={16} />
          </span>
        )}
        {snoozed ? (
          // Gmail shows the wake time of a snoozed thread in orange instead of its date.
          <span
            title={t.snoozedUntil(formatFullDate(th.snoozedUntil!))}
            className="text-right text-xs font-medium text-snooze group-hover:hidden"
          >
            {formatSnoozeTime(th.snoozedUntil!)}
          </span>
        ) : scheduled ? (
          <span
            title={t.scheduledFor(formatFullDate(th.scheduledAt!))}
            className="text-right text-xs font-medium text-error-ink group-hover:hidden"
          >
            {formatSnoozeTime(th.scheduledAt!)}
          </span>
        ) : (
          <span
            title={formatFullDate(th.lastMessageAt)}
            className={`w-16 text-right text-xs group-hover:hidden ${unread ? "font-bold" : "text-ink-muted"}`}
          >
            {date}
          </span>
        )}
        <div
          className="hidden items-center group-hover:flex group-focus-within:flex"
          onClick={(e) => e.stopPropagation()}
        >
          {[...p.hoverActions.filter((a) => a !== "deleteForever"), readAction].map((a) => {
            const meta = ACTION_META[a as keyof typeof ACTION_META];
            return (
              <IconButton
                key={a}
                icon={meta.icon}
                label={meta.label}
                tabIndex={-1}
                className="size-8"
                onClick={() => p.onAction(a, th.id)}
              />
            );
          })}
          {scheduled && (
            <IconButton
              icon="cancelSchedule"
              label={t.cancelSend}
              tabIndex={-1}
              className="size-8"
              onClick={() => p.onCancelSend(th)}
            />
          )}
          {snoozed && (
            <IconButton
              icon="moveToInbox"
              label={t.wakeNow}
              tabIndex={-1}
              className="size-8"
              onClick={() => p.onWake(th.id)}
            />
          )}
          {p.snoozable && (
            <IconButton
              icon="schedule"
              label={snoozed ? t.changeSnooze : t.snooze}
              tabIndex={-1}
              className="size-8"
              onClick={(e) => p.onSnooze(th.id, e.currentTarget)}
            />
          )}
        </div>
      </div>
    </div>
  );
});
