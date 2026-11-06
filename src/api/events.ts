import type { QueryClient } from "@tanstack/react-query";
import { draftMoved, openDraft } from "../features/compose/session";
import { notifyNewMessage } from "../features/notifications/desktop";
import { t } from "../lib/i18n";
import { useCompose } from "../state/compose";
import { setConnection, setTooManyStreams } from "../state/connection";
import { useToasts } from "../state/toasts";
import { api, clientId } from "./client";
import { call } from "./errors";
import { keys } from "./keys";
import { metaQuery } from "./queries/meta";
import { sessionLost } from "./sessionLost";
import { updateLists, type LabelsData } from "./mutations/cache";
import { appliedHere } from "./queries/filters";
import { handleOperationFailed, isThreadOpRunning } from "./mutations/threads";
import type { SyncStatus, Thread, ThreadDetail } from "./types";

type Data = Record<string, unknown>;

const EVENT_TYPES = [
  "message.new",
  "thread.updated",
  "thread.deleted",
  "thread.merged",
  "label.counts",
  "label.changed",
  "draft.updated",
  "operation.failed",
  "outbound.status",
  "filter.applied",
  "settings.updated",
  "account.status",
  "account.sync_progress",
  "account.error",
  "resync",
  "session.expired",
  "stream.limit",
] as const;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Maps one event to cache updates and invalidations (plan 5.4). */
export function applyEvent(qc: QueryClient, type: string, data: Data): void {
  const accountId = str(data.accountId);
  const own = data.origin === clientId;
  switch (type) {
    case "message.new":
      notifyNewMessage(qc, data);
      if (accountId) void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
      return;
    case "thread.merged":
      if (accountId) void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
      if (str(data.intoId)) void qc.invalidateQueries({ queryKey: keys.thread(str(data.intoId)!) });
      return;
    case "thread.updated": {
      const id = str(data.threadId);
      if (!id || !accountId) return;
      // Our own change while an operation is in flight: its answer updates the cache, the event
      // would overwrite the optimistic state (plan 5.4).
      if (own && isThreadOpRunning(qc)) return;
      const labelIds = Array.isArray(data.labelIds) ? (data.labelIds as string[]) : [];
      const patch: Partial<Thread> = {
        labelIds,
        unreadCount: Number(data.unreadCount ?? 0),
        pendingSync: Boolean(data.pendingSync),
      };
      if (typeof data.messageCount === "number") patch.messageCount = data.messageCount;
      if (str(data.lastMessageAt)) patch.lastMessageAt = str(data.lastMessageAt)!;
      if (typeof data.snippet === "string") patch.snippet = data.snippet;
      // Snooze (plan 3.10): the wake time, or null once the thread is back in Inbox.
      if ("snoozedUntil" in data) patch.snoozedUntil = str(data.snoozedUntil) ?? null;
      let seen = false;
      let moved = false;
      updateLists(qc, accountId, (row) => {
        if (row.id !== id) return row;
        seen = true;
        moved ||= patch.lastMessageAt !== undefined && patch.lastMessageAt !== row.lastMessageAt;
        return { ...row, ...patch };
      });
      qc.setQueryData<ThreadDetail>(keys.thread(id), (d) =>
        d
          ? {
              ...d,
              labelIds,
              snoozedUntil: patch.snoozedUntil !== undefined ? patch.snoozedUntil : d.snoozedUntil,
            }
          : d,
      );
      // A thread new to a list (or moved within it) needs the server's row and order.
      if (!seen || moved) {
        void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
      }
      if (patch.messageCount !== undefined)
        void qc.invalidateQueries({ queryKey: keys.thread(id) });
      return;
    }
    case "thread.deleted": {
      const id = str(data.threadId);
      if (!id) return;
      if (accountId) updateLists(qc, accountId, (row) => (row.id === id ? null : row));
      qc.removeQueries({ queryKey: keys.thread(id) });
      return;
    }
    case "label.counts": {
      if (!accountId || !Array.isArray(data.labels)) return;
      const counts = new Map(
        (data.labels as { id: string; threadsUnread: number; threadsTotal: number }[]).map((l) => [
          l.id,
          l,
        ]),
      );
      qc.setQueryData<LabelsData>(keys.labels(accountId), (d) =>
        d?.labels
          ? {
              ...d,
              labels: d.labels.map((l) => {
                const c = counts.get(l.id);
                return c
                  ? { ...l, threadsUnread: c.threadsUnread, threadsTotal: c.threadsTotal }
                  : l;
              }),
            }
          : d,
      );
      return;
    }
    case "label.changed":
      if (accountId) void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
      return;
    case "settings.updated":
      // Another session changed the settings: GET /settings again (our own answer is cached).
      if (!own) void qc.invalidateQueries({ queryKey: keys.settings });
      return;
    case "filter.applied": {
      if (accountId) {
        void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
        void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
      }
      const filterId = str(data.filterId);
      if (filterId && appliedHere.delete(filterId)) {
        useToasts.getState().show({ message: t.filtersPanel.applied(Number(data.threads ?? 0)) });
      }
      return;
    }
    case "operation.failed":
      handleOperationFailed(qc, {
        operationId: str(data.operationId),
        accountId,
        kind: str(data.kind),
        threadIds: Array.isArray(data.threadIds) ? (data.threadIds as string[]) : [],
      });
      return;
    case "draft.updated": {
      // Saved by another tab or program: the open window offers "Wczytaj / Nadpisz".
      const draftId = str(data.draftId);
      // Moved to another account ("Od") elsewhere: the window of the old id follows the new one.
      const previousId = str(data.previousDraftId);
      if (draftId && previousId && previousId !== draftId) {
        if (!own) draftMoved(qc, previousId, draftId);
        return;
      }
      if (draftId && !own && typeof data.version === "number") {
        useCompose.getState().setRemoteVersion(draftId, data.version);
      }
      return;
    }
    case "outbound.status": {
      const draftId = str(data.draftId);
      if (accountId) void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
      if (data.status !== "failed" || !draftId) return;
      // The server made the message a draft again (plan 3.9 step 6).
      useCompose.getState().setFailure(draftId, {
        error: str(data.error),
        failedRecipients: Array.isArray(data.failedRecipients)
          ? (data.failedRecipients as string[])
          : undefined,
      });
      void qc.invalidateQueries({ queryKey: keys.draft(draftId) });
      useToasts.getState().show({
        message: t.sendFailedOpen,
        action: { label: t.open, run: () => openDraft(qc, draftId) },
      });
      return;
    }
    case "account.sync_progress":
      if (!accountId) return;
      qc.setQueryData<SyncStatus>(keys.syncStatus(accountId), (s) =>
        s
          ? {
              ...s,
              initialSync: { ...s.initialSync, ...(data as Partial<SyncStatus["initialSync"]>) },
            }
          : s,
      );
      return;
    case "account.status":
    case "account.error":
      if (accountId) {
        void qc.invalidateQueries({ queryKey: keys.syncStatus(accountId) });
        // The initial sync of a new account sends no label.counts: its counters (LeftNav,
        // AccountSwitcher) are fetched again when its state changes, e.g. to live.
        if (type === "account.status")
          void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
      }
      void qc.invalidateQueries({ queryKey: keys.session });
      return;
    case "resync":
      void qc.invalidateQueries();
      return;
    case "session.expired":
      // Signed out elsewhere, revoked or disabled (the server closes the stream): as a 401.
      sessionLost();
      return;
  }
}

type EventSourceLike = Pick<EventSource, "addEventListener" | "close"> & {
  onopen: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  readyState: number;
};

export const eventsConfig = {
  url: "/api/v1/events",
  /** Failed SSE attempts in a row (never opened) before switching to polling. */
  maxSseFailures: 3,
  pollIntervalMs: 5000,
  /** While polling, how often to try SSE again. */
  sseRetryMs: 60_000,
  createEventSource: (url: string): EventSourceLike | null =>
    typeof EventSource === "undefined" ? null : new EventSource(url, { withCredentials: true }),
};

/**
 * Connects the tab to the event stream: EventSource with Last-Event-ID (the browser sends it on
 * its own reconnects; a new EventSource gets it as ?lastEventId=), and GET /events/poll when SSE
 * keeps failing (plan 5.4). Returns a cleanup function.
 */
export function connectEvents(qc: QueryClient): () => void {
  let lastId: number | null = null;
  let source: EventSourceLike | null = null;
  let failures = 0;
  let stopped = false;
  let polling = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let sseRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let opened = false;

  const handle = (type: string, id: string | number | undefined, raw: unknown) => {
    const n = Number(id);
    if (Number.isFinite(n) && id !== "" && id !== undefined) lastId = n;
    let data: Data = {};
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw) as Data;
      } catch {
        return;
      }
    } else if (raw && typeof raw === "object") data = raw as Data;
    applyEvent(qc, type, data);
  };

  const openSse = () => {
    const url = lastId === null ? eventsConfig.url : `${eventsConfig.url}?lastEventId=${lastId}`;
    const es = eventsConfig.createEventSource(url);
    if (!es) return startPolling();
    source = es;
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (ev) => {
        const me = ev as MessageEvent;
        if (type === "stream.limit") return onStreamLimit(me.data);
        handle(type, me.lastEventId, me.data);
      });
    }
    es.onopen = () => {
      failures = 0;
      polling = false;
      clearTimeout(pollTimer);
      clearTimeout(sseRetryTimer);
      setConnection("live");
      setTooManyStreams(false);
      // A reconnect may follow an upgrade of the server: GET /meta again (version banner).
      if (opened) void qc.invalidateQueries({ queryKey: metaQuery.queryKey });
      opened = true;
    };
    es.onerror = () => {
      failures += 1;
      // EventSource retries by itself; after repeated failures (or a closed stream) fall back.
      if (es.readyState === 2 || failures >= eventsConfig.maxSseFailures) {
        es.close();
        source = null;
        startPolling();
      } else {
        void probe();
      }
    };
  };

  // Tells "server unreachable" (offline banner) apart from "SSE not available".
  const probe = async () => {
    try {
      await call(api.GET("/meta"));
    } catch {
      if (!stopped) setConnection("offline");
    }
  };

  const poll = async () => {
    if (stopped || source) {
      polling = false;
      return;
    }
    try {
      const res = await call(
        api.GET("/events/poll", { params: { query: { after: lastId ?? 0 } } }),
      );
      if (lastId === null) {
        // First poll without a position: skip the retained backlog, refetch the current state.
        lastId = res.nextAfter;
        void qc.invalidateQueries();
      } else {
        for (const ev of res.events ?? []) handle(ev.type, ev.id, ev.data);
        lastId = res.nextAfter;
      }
      setConnection("polling");
    } catch {
      setConnection("offline");
    }
    if (!stopped) pollTimer = setTimeout(poll, eventsConfig.pollIntervalMs);
  };

  /**
   * More than 8 streams of the user (plan 5.4): the server answers 200 with `stream.limit` and
   * closes the stream. Close it here too, so that EventSource does not reconnect after its retry
   * hint; poll and try SSE again after `retryAfter` seconds, with a banner asking to close tabs.
   */
  const onStreamLimit = (raw: unknown) => {
    let retryAfter = 30;
    try {
      const d = JSON.parse(String(raw)) as { retryAfter?: unknown };
      if (typeof d.retryAfter === "number" && d.retryAfter > 0) retryAfter = d.retryAfter;
    } catch {
      // keep the default
    }
    source?.close();
    source = null;
    if (stopped) return;
    setTooManyStreams(true);
    startPolling(retryAfter * 1000);
  };

  const startPolling = (sseRetryMs = eventsConfig.sseRetryMs) => {
    if (stopped || polling) return;
    polling = true;
    void poll();
    clearTimeout(sseRetryTimer);
    sseRetryTimer = setTimeout(() => {
      if (stopped) return;
      failures = 0;
      openSse();
    }, sseRetryMs);
  };

  openSse();
  return () => {
    stopped = true;
    source?.close();
    clearTimeout(pollTimer);
    clearTimeout(sseRetryTimer);
  };
}
