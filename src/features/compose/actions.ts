import type { QueryClient } from "@tanstack/react-query";
import { createDraft, type DraftMode } from "../../api/drafts";
import { keys } from "../../api/keys";
import { findCachedThread } from "../../api/mutations/cache";
import { threadQuery } from "../../api/queries/threads";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { openDraft, openLoaded } from "./session";

let creating = false;

async function create(qc: QueryClient, body: Parameters<typeof createDraft>[0], maximized = false) {
  // A second `c` while the first draft is being created must not create another one.
  if (creating) return;
  creating = true;
  try {
    const d = await createDraft(body);
    openLoaded(qc, d, { created: true, maximized });
    void qc.invalidateQueries({ queryKey: keys.threadsAll(d.accountId) });
  } catch {
    toast(t.genericError);
  } finally {
    creating = false;
  }
}

/** "Utwórz" / `c`: POST /drafts for the account (plan 3.8). */
export const openNewCompose = (qc: QueryClient, accountId: string | undefined, maximized = false) =>
  create(qc, { accountId }, maximized);

/** Reply, reply all, forward: the server prefills recipients, subject and quote. */
export const openReply = (qc: QueryClient, messageId: string, mode: DraftMode) =>
  create(qc, { replyToMessageId: messageId, mode });

/** A row of the Drafts list opens its draft in a compose window instead of the thread. */
export async function openDraftOfThread(qc: QueryClient, threadId: string): Promise<boolean> {
  try {
    // Thread.draftId of the row; the thread is fetched only when the row is not cached.
    const row = findCachedThread(qc, threadId);
    const draftId =
      row?.draftId !== undefined
        ? row.draftId
        : (await qc.fetchQuery(threadQuery(threadId))).messages?.findLast((m) => m.draftId)
            ?.draftId;
    if (!draftId) return false;
    openDraft(qc, draftId);
    return true;
  } catch {
    toast(t.genericError);
    return true;
  }
}
