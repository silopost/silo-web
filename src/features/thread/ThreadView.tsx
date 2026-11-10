import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState } from "react";
import type { DraftMode } from "../../api/drafts";
import { neighbourInList, type ThreadLists } from "../../api/mutations/cache";
import { snoozeThreads, wakeThread } from "../../api/mutations/snooze";
import type { ThreadAction } from "../../api/mutations/threads";
import { keys } from "../../api/keys";
import { useLabels } from "../../api/queries/labels";
import { threadQuery } from "../../api/queries/threads";
import type { Message, ThreadDetail } from "../../api/types";
import { IconButton } from "../../components/IconButton";
import { formatFullDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { NO_COLOR_BG, NO_COLOR_TEXT } from "../../lib/labelColors";
import { isSystemLabelId } from "../../lib/labels";
import { useShortcutHandlers } from "../../shortcuts/useShortcuts";
import { useActiveAccount } from "../account";
import { useCompose } from "../../state/compose";
import { openInlineReply, openReply } from "../compose/actions";
import { InlineReply } from "../compose/InlineReply";
import { closeInline, openDraft } from "../compose/session";
import { LabelsPopover } from "../labels/LabelsPopover";
import type { MoveCommand } from "../labels/move";
import { MovePopover } from "../labels/MovePopover";
import { SnoozeMenu } from "../snooze/PresetTimeMenu";
import { PendingIcon } from "../sync/PendingIcon";
import { ACTION_META } from "../threadlist/actionMeta";
import { actionsForLabels, canSnoozeView, type ListContext } from "../threadlist/listContext";
import { useThreadCommands } from "../threadlist/useThreadCommands";
import { MessageCard } from "./MessageCard";
import { ReplyBar } from "./ReplyBar";

/** Collapsed read messages, expanded unread ones and the last one (plan 5.2). */
function initiallyExpanded(messages: Message[]): Set<string> {
  const ids = messages.filter((m) => (m.labelIds ?? []).includes("UNREAD")).map((m) => m.id);
  const last = messages[messages.length - 1];
  if (last) ids.push(last.id);
  return new Set(ids);
}

/** Runs of 3+ collapsed messages between the first and the expanded ones fold into one bar. */
const FOLD_MIN = 3;

export function ThreadView({ ctx, threadId }: { ctx: ListContext; threadId: string }) {
  const qc = useQueryClient();
  const account = useActiveAccount();
  const labels = useLabels(ctx.accountId);
  const thread = useQuery({
    ...threadQuery(threadId),
    // The row of the list shows the header at once (plan 6.4).
    placeholderData: () => {
      for (const [, data] of qc.getQueriesData<ThreadLists>({
        queryKey: keys.threadsAll(ctx.accountId),
      })) {
        const row = data?.pages.flatMap((p) => p.threads ?? []).find((r) => r.id === threadId);
        if (row) {
          return {
            id: row.id,
            accountId: row.accountId,
            subject: row.subject,
            labelIds: row.labelIds,
            messages: null,
            snoozedUntil: row.snoozedUntil,
            scheduledAt: row.scheduledAt,
            outboundId: row.outboundId,
          } satisfies ThreadDetail;
        }
      }
      return undefined;
    },
  });
  const detail = thread.data;
  const messages = detail?.messages ?? [];
  const labelIds = detail?.labelIds ?? [];
  const { run, dialog } = useThreadCommands(ctx.accountId);

  const [expandedState, setExpanded] = useState<{ id: string; set: Set<string> } | null>(null);
  const [unfolded, setUnfolded] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  /** Message cursor of n / p (plan 6.6); null = not moved yet in this thread. */
  const [cursor, setCursor] = useState<{ id: string; index: number } | null>(null);
  const expanded = expandedState?.id === threadId ? expandedState.set : initiallyExpanded(messages);
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    setExpanded({ id: threadId, set: next });
  };

  // Opening marks the thread read: the server does not do it by itself (plan 5.2).
  const marked = useRef<string | null>(null);
  const isUnread = labelIds.includes("UNREAD");
  const loaded = thread.isSuccess && !thread.isPlaceholderData;
  useEffect(() => {
    if (!loaded || !isUnread || marked.current === threadId) return;
    marked.current = threadId;
    run("read", [threadId], { silent: true });
  }, [loaded, isUnread, threadId, run]);

  const older = neighbourInList(qc, ctx.accountId, ctx.filter, threadId, 1);
  const newer = neighbourInList(qc, ctx.accountId, ctx.filter, threadId, -1);
  const open = (id: string | undefined) => (id ? ctx.openThread(id) : undefined);
  // After archive / trash / spam the view returns to the list, as Gmail does by default
  // ("auto-advance" off). Opening the next thread instead marked it read without the user
  // seeing it, and the Inbox counter dropped by more than the archived thread (e2e, Faza 3).
  const leave = ctx.backToList;

  const folderActions = actionsForLabels(labelIds);
  const snoozedUntil = detail?.snoozedUntil ?? null;
  const snoozable =
    canSnoozeView(ctx.filter) && !labelIds.includes("TRASH") && !labelIds.includes("SPAM");
  const snooze = (until: string) => {
    void snoozeThreads(qc, {
      accountId: ctx.accountId,
      ids: [threadId],
      until,
      onUndo: () => ctx.openThread(threadId),
    });
    leave();
  };
  const act = (action: ThreadAction) => {
    if (action === "unread") {
      run(action, [threadId], { after: ctx.backToList });
      return;
    }
    const leaves = action !== "read" && action !== "star" && action !== "unstar";
    run(action, [threadId], {
      after: leaves ? leave : undefined,
      onUndo: leaves ? () => ctx.openThread(threadId) : undefined,
    });
  };
  const allowed = (a: ThreadAction) => () => {
    if (folderActions.includes(a)) act(a);
  };

  // Replies go to the last message that is not a draft or a message waiting to be sent.
  const replyTarget = messages.findLast((m) => {
    const ls = m.labelIds ?? [];
    return !ls.includes("DRAFT") && !ls.includes("SCHEDULED");
  });
  // Reply and reply all open under the message they answer; forward opens in the dock.
  const reply = (mode: DraftMode, messageId = replyTarget?.id) => {
    if (!messageId) return;
    if (mode === "forward") void openReply(qc, messageId, mode);
    else void openInlineReply(qc, threadId, messageId, mode);
  };
  const inlineReply = useCompose((s) => (s.inline?.threadId === threadId ? s.inline : null));
  // Leaving the thread (another thread, back to the list) saves and closes its inline reply.
  useEffect(
    () => () => {
      if (useCompose.getState().inline?.threadId === threadId) void closeInline();
    },
    [threadId],
  );

  // Fold long runs of collapsed messages after the first one.
  const firstExpanded = messages.findIndex((m, i) => i > 0 && expanded.has(m.id));
  const foldEnd = firstExpanded < 0 ? messages.length - 1 : firstExpanded;
  const fold = !unfolded && foldEnd - 1 >= FOLD_MIN;
  // The inline reply goes under its message; when that one is folded away or gone, at the end.
  const anchorIndex = inlineReply ? messages.findIndex((m) => m.id === inlineReply.anchorId) : -1;
  const inlineAnchor =
    inlineReply && anchorIndex >= 0 && !(fold && anchorIndex >= 1 && anchorIndex < foldEnd)
      ? inlineReply.anchorId
      : null;

  // n / p: the cursor starts at the first expanded message (unread or the last one).
  const focusMessage = (step: 1 | -1) => {
    if (messages.length === 0) return;
    const start =
      cursor?.id === threadId
        ? cursor.index
        : Math.max(
            messages.findIndex((m) => expanded.has(m.id)),
            0,
          );
    const index = Math.min(Math.max(start + step, 0), messages.length - 1);
    setCursor({ id: threadId, index });
    if (index >= 1 && index < foldEnd) setUnfolded(true);
    const id = messages[index]!.id;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`);
      el?.focus();
      el?.scrollIntoView?.({ block: "nearest" });
    });
  };
  // A move leaves the thread view, as archive does.
  const move = (c: MoveCommand) =>
    run(c.action, [threadId], {
      add: c.add,
      remove: c.remove,
      after: leave,
      onUndo: () => ctx.openThread(threadId),
    });

  useShortcutHandlers({
    nextMessage: () => focusMessage(1),
    prevMessage: () => focusMessage(-1),
    label: () => setLabelsOpen(true),
    move: () => setMoveOpen(true),
    reply: () => reply("reply"),
    replyAll: () => reply("replyAll"),
    forward: () => reply("forward"),
    back: ctx.backToList,
    next: () => open(older),
    prev: () => open(newer),
    archive: allowed("archive"),
    trash: () => act(labelIds.includes("TRASH") ? "deleteForever" : "trash"),
    spam: allowed("spam"),
    star: () => act(labelIds.includes("STARRED") ? "unstar" : "star"),
    markRead: () => act("read"),
    markUnread: () => act("unread"),
    snooze: () => snoozable && setSnoozeOpen(true),
  });

  const chips = labelIds
    .filter((id) => !isSystemLabelId(id))
    .map((id) => labels.find((l) => l.id === id))
    .filter((l) => !!l);

  return (
    <section aria-label={detail?.subject || t.noSubject} className="flex min-h-0 flex-1 flex-col">
      <div
        role="toolbar"
        aria-label={t.threadList}
        className="flex h-12 shrink-0 items-center gap-1 px-2"
      >
        <IconButton icon="arrowBack" label={t.back} onClick={ctx.backToList} />
        {folderActions.map((a) => {
          const meta = ACTION_META[a as keyof typeof ACTION_META];
          return <IconButton key={a} icon={meta.icon} label={meta.label} onClick={() => act(a)} />;
        })}
        <IconButton icon="markUnread" label={t.markUnread} onClick={() => act("unread")} />
        {snoozable && (
          <SnoozeMenu open={snoozeOpen} onOpenChange={setSnoozeOpen} onPick={snooze}>
            <IconButton icon="schedule" label={snoozedUntil ? t.changeSnooze : t.snooze} />
          </SnoozeMenu>
        )}
        {snoozedUntil && (
          <IconButton
            icon="moveToInbox"
            label={t.wakeNow}
            onClick={() => {
              void wakeThread(qc, ctx.accountId, threadId);
            }}
          />
        )}
        <LabelsPopover
          accountId={ctx.accountId}
          threads={[{ id: threadId, labelIds }]}
          onChange={(add, remove) => run("labels", [threadId], { add, remove })}
          open={labelsOpen}
          onOpenChange={setLabelsOpen}
        />
        <MovePopover
          accountId={ctx.accountId}
          threads={[{ id: threadId, labelIds }]}
          onMove={move}
          open={moveOpen}
          onOpenChange={setMoveOpen}
        />
        <div className="ml-auto flex items-center">
          <IconButton
            icon="chevronLeft"
            label={t.newer}
            disabled={!newer}
            onClick={() => open(newer)}
          />
          <IconButton
            icon="chevronRight"
            label={t.older}
            disabled={!older}
            onClick={() => open(older)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {thread.isError && !detail && (
          <p role="alert" className="p-6">
            {t.threadNotFound}
          </p>
        )}
        {detail && (
          <>
            <header className="flex flex-wrap items-center gap-2 py-4 pr-4 pl-[72px]">
              <h1 className="text-2xl">{detail.subject || t.noSubject}</h1>
              {chips.map((l) => (
                <span
                  key={l.id}
                  className="rounded px-1.5 text-xs"
                  style={{
                    backgroundColor: l.colorBg ?? NO_COLOR_BG,
                    color: l.colorText ?? NO_COLOR_TEXT,
                  }}
                >
                  {l.name}
                </span>
              ))}
              <PendingIcon pending={messages.some((m) => m.pendingSync)} />
            </header>
            {snoozedUntil && (
              <p
                role="status"
                className="mx-4 mb-2 ml-[72px] rounded bg-warn-bg px-3 py-1.5 text-sm text-warn-ink"
              >
                {t.snoozedUntil(formatFullDate(snoozedUntil))}
              </p>
            )}
            {thread.isPlaceholderData && (
              <p role="status" className="px-4 text-ink-muted">
                {t.loading}
              </p>
            )}
            {messages.map((m, i) => {
              if (fold && i >= 1 && i < foldEnd) {
                if (i > 1) return null;
                return (
                  <button
                    key="fold"
                    type="button"
                    onClick={() => setUnfolded(true)}
                    className="flex w-full items-center gap-3 border-t border-line px-4 py-2 text-left text-primary hover:bg-surface"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full border border-line text-xs">
                      {foldEnd - 1}
                    </span>
                    {t.olderMessages(foldEnd - 1)}
                  </button>
                );
              }
              const draftId = m.draftId;
              // The draft of the open inline reply is shown as the reply itself.
              if (draftId && draftId === inlineReply?.draftId) return null;
              if (draftId) {
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openDraft(qc, draftId)}
                    className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left hover:bg-surface"
                  >
                    <span className="w-48 shrink-0 font-medium text-error-ink">{t.draftLabel}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{m.snippet}</span>
                  </button>
                );
              }
              return (
                <Fragment key={m.id}>
                  <MessageCard
                    message={m}
                    expanded={expanded.has(m.id)}
                    me={account?.email ?? ""}
                    onToggle={() => toggle(m.id)}
                    onStar={(star) => act(star ? "star" : "unstar")}
                    onReply={(mode) => reply(mode, m.id)}
                  />
                  {inlineReply && inlineAnchor === m.id && (
                    <InlineReply key={inlineReply.key} reply={inlineReply} />
                  )}
                </Fragment>
              );
            })}
            {inlineReply && inlineAnchor === null && (
              <InlineReply key={inlineReply.key} reply={inlineReply} />
            )}
            {replyTarget && !inlineReply && <ReplyBar onReply={(mode) => reply(mode)} />}
          </>
        )}
      </div>
      {dialog}
    </section>
  );
}
