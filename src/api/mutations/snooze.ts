import type { QueryClient } from "@tanstack/react-query";
import { formatSnoozeTime } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toast, useToasts } from "../../state/toasts";
import { api } from "../client";
import { call, isApiError } from "../errors";
import { keys } from "../keys";
import type { OperationResult, SnoozeResult, Thread, ThreadDetail } from "../types";
import {
  applyOptimistic,
  mergeServerThreads,
  restoreSnapshot,
  takeSnapshot,
  updateLists,
  type Snapshot,
} from "./cache";
import { MUTATION_KEY, remember, scopeOf, settle } from "./threads";

/** At most this many threads are snoozed by one command (one request per thread). */
export const MAX_SNOOZE = 50;

/** Sets snoozedUntil of cached rows and open threads (the labels change separately). */
function patchSnoozedUntil(
  qc: QueryClient,
  accountId: string,
  ids: string[],
  until: string | null,
) {
  const set = new Set(ids);
  updateLists(qc, accountId, (th) => (set.has(th.id) ? { ...th, snoozedUntil: until } : th));
  for (const id of ids) {
    qc.setQueryData<ThreadDetail>(keys.thread(id), (d) => (d ? { ...d, snoozedUntil: until } : d));
  }
}

/** Server rows over the cache, snoozedUntil of open threads included. */
function mergeSnoozed(qc: QueryClient, accountId: string, threads: Thread[]) {
  mergeServerThreads(qc, accountId, threads);
  for (const th of threads) {
    qc.setQueryData<ThreadDetail>(keys.thread(th.id), (d) =>
      d ? { ...d, snoozedUntil: th.snoozedUntil } : d,
    );
  }
}

function snoozeError(err: unknown): string {
  if (isApiError(err) && err.code === "not_in_inbox") return t.snoozeNotInInbox;
  if (isApiError(err) && err.code === "invalid_snooze") return t.snoozeInvalid;
  return t.genericError;
}

export type SnoozeInput = {
  accountId: string;
  ids: string[];
  /** RFC 3339 wake time: a preset's `until` or the picked date and time. */
  until: string;
  /** Runs on "Cofnij" (e.g. reopen the thread that was snoozed from its view). */
  onUndo?: () => void;
};

/**
 * Snooze (plan 3.10): the threads leave Inbox at once (optimistic), one POST
 * /threads/{id}/snooze per thread (at most 50), the server rows written over the cache and a
 * snackbar whose "Cofnij" undoes every operation. The wake time is never computed here.
 */
export function snoozeThreads(qc: QueryClient, input: SnoozeInput): Promise<void> {
  const { accountId, until } = input;
  const ids = input.ids.slice(0, MAX_SNOOZE);
  if (ids.length === 0) return Promise.resolve();
  const optimistic = () => {
    const snapshot = takeSnapshot(qc, accountId, ids);
    applyOptimistic(qc, accountId, ids, ["SNOOZED"], ["INBOX"]);
    patchSnoozedUntil(qc, accountId, ids, until);
    return snapshot;
  };
  // As with the other thread actions, the row leaves the list in the event that started it.
  const early = qc.isFetching({ queryKey: keys.threadsAll(accountId) }) > 0 ? null : optimistic();

  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: MUTATION_KEY,
    scope: { id: scopeOf(ids) },
    mutationFn: () =>
      Promise.allSettled(
        ids.map((id) =>
          call(api.POST("/threads/{id}/snooze", { params: { path: { id } }, body: { until } })),
        ),
      ),
    onMutate: async (): Promise<Snapshot> => {
      if (early) return early;
      await qc.cancelQueries({ queryKey: keys.threadsAll(accountId) });
      return optimistic();
    },
    onSuccess: (results: PromiseSettledResult<SnoozeResult>[], _vars, snapshot) => {
      const done = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
      if (done.length === 0) {
        if (snapshot) restoreSnapshot(qc, snapshot);
        toast(snoozeError(failed[0]));
        return;
      }
      mergeSnoozed(
        qc,
        accountId,
        done.map((r) => r.thread),
      );
      const opIds = done.flatMap((r) => (r.operationId ? [r.operationId] : []));
      if (snapshot) for (const op of opIds) remember(op, accountId, snapshot);
      const text = t.done.snooze(done.length, formatSnoozeTime(until));
      const message = failed.length ? `${text}. ${snoozeError(failed[0])}` : text;
      const toasts = useToasts.getState();
      if (opIds.length === 0 || !snapshot) {
        toasts.show({ message });
        return;
      }
      const undo = () =>
        undoOperations(qc, { accountId, ids, operationIds: opIds, snapshot, onUndo: input.onUndo });
      const ends = done.flatMap((r) => (r.undoUntil ? [Date.parse(r.undoUntil)] : []));
      toasts.setLastUndo(undo);
      toasts.show({
        message,
        action: { label: t.undo, run: undo },
        hideAt: ends.length ? Math.min(...ends) : undefined,
      });
    },
    onError: (_err, _vars, snapshot) => {
      if (snapshot) restoreSnapshot(qc, snapshot);
      toast(t.genericError);
    },
    onSettled: () => settle(qc, accountId, ids),
  });
  return mutation.execute(undefined).then(
    () => undefined,
    () => undefined,
  );
}

type UndoManyInput = {
  accountId: string;
  ids: string[];
  operationIds: string[];
  snapshot: Snapshot;
  onUndo?: () => void;
};

type UndoManyResult = { results: OperationResult[]; error: unknown };

/** "Cofnij" of a snooze of several threads: the snapshot at once, then the undo of each one. */
export function undoOperations(qc: QueryClient, input: UndoManyInput): Promise<void> {
  const { accountId, ids, operationIds, snapshot } = input;
  const toasts = useToasts.getState();
  toasts.dismiss();
  toasts.setLastUndo(null);
  restoreSnapshot(qc, snapshot);
  input.onUndo?.();

  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: MUTATION_KEY,
    scope: { id: scopeOf(ids) },
    mutationFn: async (): Promise<UndoManyResult> => {
      const results: OperationResult[] = [];
      let error: unknown = null;
      for (const id of operationIds) {
        try {
          results.push(await call(api.POST("/operations/{id}/undo", { params: { path: { id } } })));
        } catch (err) {
          error ??= err;
        }
      }
      return { results, error };
    },
    onSuccess: ({ results, error }: UndoManyResult) => {
      mergeSnoozed(
        qc,
        accountId,
        results.flatMap((r) => r.threads ?? []),
      );
      if (error) toast(isApiError(error, 409) ? t.undoExpired : t.genericError);
    },
    onError: () => toast(t.genericError),
    onSettled: () => settle(qc, accountId, ids),
  });
  return mutation.execute(undefined).then(
    () => undefined,
    () => undefined,
  );
}

/** "Unsnooze": DELETE /threads/{id}/snooze, back to Inbox at once (no undo, plan 3.10). */
export function wakeThread(qc: QueryClient, accountId: string, id: string): Promise<void> {
  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: MUTATION_KEY,
    scope: { id: scopeOf([id]) },
    mutationFn: () => call(api.DELETE("/threads/{id}/snooze", { params: { path: { id } } })),
    onMutate: async (): Promise<Snapshot> => {
      await qc.cancelQueries({ queryKey: keys.threadsAll(accountId) });
      const snapshot = takeSnapshot(qc, accountId, [id]);
      applyOptimistic(qc, accountId, [id], ["INBOX"], ["SNOOZED"]);
      patchSnoozedUntil(qc, accountId, [id], null);
      return snapshot;
    },
    onSuccess: (res: SnoozeResult) => {
      mergeSnoozed(qc, accountId, [res.thread]);
      toast(t.done.woken);
    },
    onError: (err, _vars, snapshot) => {
      if (snapshot) restoreSnapshot(qc, snapshot);
      toast(isApiError(err) && err.code === "not_snoozed" ? t.notSnoozed : t.genericError);
    },
    onSettled: () => settle(qc, accountId, [id]),
  });
  return mutation.execute(undefined).then(
    () => undefined,
    () => undefined,
  );
}
