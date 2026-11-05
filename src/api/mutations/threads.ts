import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { t } from "../../lib/i18n";
import { toast, useToasts } from "../../state/toasts";
import { api } from "../client";
import { call, isApiError } from "../errors";
import { keys } from "../keys";
import type { OperationResult } from "../types";
import {
  applyOptimistic,
  mergeServerThreads,
  removeFromLists,
  restoreSnapshot,
  takeSnapshot,
  type Snapshot,
} from "./cache";

export type ThreadAction =
  | "archive"
  | "inbox"
  | "trash"
  | "untrash"
  | "spam"
  | "notSpam"
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "labels"
  | "deleteForever";

type Spec = {
  /** Endpoint: modify with add/remove, or one of the batch endpoints. */
  endpoint: "modify" | "trash" | "untrash" | "delete";
  add?: string[];
  remove?: string[];
  /** Snackbar text with "Cofnij"; silent actions (star, read on open) have none. */
  message?: (n: number) => string;
};

const SPECS: Record<Exclude<ThreadAction, "labels">, Spec> = {
  archive: { endpoint: "modify", remove: ["INBOX"], message: t.done.archive },
  inbox: { endpoint: "modify", add: ["INBOX"], message: t.done.inbox },
  trash: { endpoint: "trash", add: ["TRASH"], message: t.done.trash },
  untrash: { endpoint: "untrash", remove: ["TRASH"], message: t.done.untrash },
  spam: { endpoint: "modify", add: ["SPAM"], message: t.done.spam },
  notSpam: { endpoint: "modify", remove: ["SPAM"], message: t.done.inbox },
  read: { endpoint: "modify", remove: ["UNREAD"], message: t.done.read },
  unread: { endpoint: "modify", add: ["UNREAD"], message: t.done.unread },
  star: { endpoint: "modify", add: ["STARRED"] },
  unstar: { endpoint: "modify", remove: ["STARRED"] },
  deleteForever: { endpoint: "delete", message: t.done.deleted },
};

export type ThreadActionInput = {
  accountId: string;
  ids: string[];
  action: ThreadAction;
  /** For "labels": user labels to add / remove. */
  add?: string[];
  remove?: string[];
  /** No snackbar (e.g. marking read on open). */
  silent?: boolean;
  /** Called on "Cofnij", e.g. to navigate back to the thread that was archived from its view. */
  onUndo?: () => void;
};

const MUTATION_KEY = ["threads-op"] as const;

/** Operations of this tab, for operation.failed (plan 5.7): their pre-operation snapshot. */
const recentOps = new Map<string, { accountId: string; snapshot: Snapshot }>();
const MAX_RECENT = 50;

function remember(operationId: string, accountId: string, snapshot: Snapshot): void {
  recentOps.set(operationId, { accountId, snapshot });
  if (recentOps.size > MAX_RECENT) recentOps.delete(recentOps.keys().next().value!);
}

/** Mutations are serialised per thread so that fast e → z → e does not interleave (plan 6.5). */
function scopeOf(ids: string[]): string {
  return ids.length === 1 ? `thread:${ids[0]}` : `threads:${[...ids].sort().join(",")}`;
}

function request(spec: Spec, ids: string[], add: string[], remove: string[]) {
  switch (spec.endpoint) {
    case "trash":
      return call(api.POST("/threads/trash", { body: { ids } }));
    case "untrash":
      return call(api.POST("/threads/untrash", { body: { ids } }));
    case "delete":
      return call(api.POST("/threads/delete", { body: { ids } }));
    case "modify":
      return call(
        api.POST("/threads/modify", {
          body: { ids, addLabelIds: add, removeLabelIds: remove },
        }),
      );
  }
}

/** Refetches in the background once no other thread operation is in flight (plan 6.5 step 5). */
function settle(qc: QueryClient, accountId: string, ids: string[]): void {
  if (qc.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
  void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
  void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
  for (const id of ids) void qc.invalidateQueries({ queryKey: keys.thread(id) });
}

/**
 * Runs a thread action with an optimistic update (plan 6.5): snapshot and local change, the
 * request, the server state written over the cache, a snackbar with "Cofnij" while the server's
 * undo window lasts, rollback on error.
 */
export function runThreadAction(qc: QueryClient, input: ThreadActionInput): Promise<void> {
  const { accountId, ids } = input;
  const spec: Spec =
    input.action === "labels"
      ? { endpoint: "modify", add: input.add, remove: input.remove, message: t.done.labels }
      : SPECS[input.action];
  const add = spec.add ?? [];
  const remove = spec.remove ?? [];

  const optimistic = () => {
    const snapshot = takeSnapshot(qc, accountId, ids);
    if (spec.endpoint === "delete") removeFromLists(qc, accountId, ids);
    else applyOptimistic(qc, accountId, ids, add, remove);
    return snapshot;
  };
  // With no list refetch in flight the local change is made right here, in the keydown or click
  // that started the action, so that it shows in the next frame (DoD Faza 3: the row leaves the
  // list within one frame). A refetch in flight is cancelled first: its revert would otherwise
  // overwrite the change.
  const early = qc.isFetching({ queryKey: keys.threadsAll(accountId) }) > 0 ? null : optimistic();

  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: MUTATION_KEY,
    scope: { id: scopeOf(ids) },
    mutationFn: () => request(spec, ids, add, remove),
    onMutate: async () => {
      if (early) return early;
      await qc.cancelQueries({ queryKey: keys.threadsAll(accountId) });
      return optimistic();
    },
    onSuccess: (res: OperationResult, _vars, snapshot) => {
      mergeServerThreads(qc, accountId, res.threads ?? []);
      const opId = res.operationId;
      if (opId && snapshot) remember(opId, accountId, snapshot);
      if (input.silent || !spec.message) return;
      const toasts = useToasts.getState();
      if (!opId || !snapshot || spec.endpoint === "delete") {
        toasts.show({ message: spec.message(ids.length) });
        return;
      }
      const undo = () =>
        undoOperation(qc, { operationId: opId, accountId, ids, snapshot, onUndo: input.onUndo });
      toasts.setLastUndo(undo);
      toasts.show({
        message: spec.message(ids.length),
        action: { label: t.undo, run: undo },
        hideAt: res.undoUntil ? Date.parse(res.undoUntil) : undefined,
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

type UndoInput = {
  operationId: string;
  accountId: string;
  ids: string[];
  snapshot: Snapshot;
  onUndo?: () => void;
};

/**
 * "Cofnij" (or `z`): the pre-operation snapshot comes back at once and the server undoes the
 * operation, inside the window or with an inverse operation after it (plan 5.2); its answer is
 * the state written over the cache.
 */
export function undoOperation(qc: QueryClient, input: UndoInput): Promise<void> {
  const { operationId, accountId, ids, snapshot } = input;
  const toasts = useToasts.getState();
  toasts.dismiss();
  toasts.setLastUndo(null);
  recentOps.delete(operationId);
  restoreSnapshot(qc, snapshot);
  input.onUndo?.();

  const mutation = qc.getMutationCache().build(qc, {
    mutationKey: MUTATION_KEY,
    scope: { id: scopeOf(ids) },
    mutationFn: () =>
      call(api.POST("/operations/{id}/undo", { params: { path: { id: operationId } } })),
    onSuccess: (res: OperationResult) => mergeServerThreads(qc, accountId, res.threads ?? []),
    onError: (err) => {
      toast(isApiError(err, 409) ? t.undoExpired : t.genericError);
    },
    onSettled: () => settle(qc, accountId, ids),
  });
  return mutation.execute(undefined).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * operation.failed from SSE (plan 5.4, 5.7): the write-back was given up and the server state
 * restored. Like a rollback: the snapshot of the operation (when this tab started it) comes back
 * at once, the server state is refetched and a snackbar explains it.
 */
export function handleOperationFailed(
  qc: QueryClient,
  event: { operationId?: string; accountId?: string; kind?: string; threadIds?: string[] },
): void {
  const entry = event.operationId ? recentOps.get(event.operationId) : undefined;
  if (entry) {
    recentOps.delete(event.operationId!);
    restoreSnapshot(qc, entry.snapshot);
  }
  const accountId = event.accountId ?? entry?.accountId;
  const ids = event.threadIds ?? [];
  if (accountId) {
    void qc.invalidateQueries({ queryKey: keys.threadsAll(accountId) });
    void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
  }
  for (const id of ids) void qc.invalidateQueries({ queryKey: keys.thread(id) });
  toast(t.operationFailed(event.kind, Math.max(ids.length, 1)));
}

/** Thread actions bound to the query client. */
export function useModifyThreads() {
  const qc = useQueryClient();
  return useMemo(() => (input: ThreadActionInput) => runThreadAction(qc, input), [qc]);
}

export function isThreadOpRunning(qc: QueryClient): boolean {
  return qc.isMutating({ mutationKey: MUTATION_KEY }) > 0;
}
