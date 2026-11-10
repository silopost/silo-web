import type { QueryClient } from "@tanstack/react-query";
import { createDraft, type DraftMode } from "../../api/drafts";
import { keys } from "../../api/keys";
import { findCachedThread } from "../../api/mutations/cache";
import { sessionQuery } from "../../api/queries/session";
import { threadQuery } from "../../api/queries/threads";
import type { Draft, Session, Settings } from "../../api/types";
import { t } from "../../lib/i18n";
import { useCompose, type InlineReplyState } from "../../state/compose";
import { toast } from "../../state/toasts";
import { closeInline, openDraft, openLoaded } from "./session";

let creating = false;

/**
 * The signature of the settings goes into a new draft as a div.silo-signature under the first
 * (empty) paragraph, above the quote of a reply (plan 5.1 /settings). Text only: the draft is
 * saved with it once the user edits.
 */
function withSignature(qc: QueryClient, d: Draft): Draft {
  const settings =
    qc.getQueryData<Settings>(keys.settings) ??
    qc.getQueryData<Session>(sessionQuery.queryKey)?.settings;
  const signature = settings?.signature?.trim();
  if (!signature || d.bodyJson) return d;
  const rest = d.bodyHtml.replace(/^<p><\/p>/, "");
  return {
    ...d,
    bodyHtml: `<p></p><div class="silo-signature">${signature}</div>${rest}`,
  };
}

type OpenOpts = { maximized?: boolean; inline?: Omit<InlineReplyState, "draftId" | "key"> };

async function create(
  qc: QueryClient,
  body: Parameters<typeof createDraft>[0],
  opts: OpenOpts = {},
) {
  // A second `c` while the first draft is being created must not create another one.
  if (creating) return;
  creating = true;
  try {
    const d = withSignature(qc, await createDraft(body));
    openLoaded(qc, d, { created: true, ...opts });
    // Forward: parts of the original that could not be carried over (plan 5.1 POST /drafts).
    const warnings = (d.warnings ?? []).map((w) => t.forwardWarnings[w]).filter(Boolean);
    if (warnings.length > 0) toast(warnings.join(" "));
    void qc.invalidateQueries({ queryKey: keys.threadsAll(d.accountId) });
  } catch {
    toast(t.genericError);
  } finally {
    creating = false;
  }
}

/** "Compose" / `c`: POST /drafts for the account (plan 3.8). */
export const openNewCompose = (qc: QueryClient, accountId: string | undefined, maximized = false) =>
  create(qc, { accountId }, { maximized });

/** Reply, reply all, forward: the server prefills recipients, subject and quote. */
export const openReply = (qc: QueryClient, messageId: string, mode: DraftMode) =>
  create(qc, { replyToMessageId: messageId, mode });

/** Focuses the editor of the open inline reply and scrolls it into view. */
export function focusInline() {
  const inline = useCompose.getState().inline;
  if (!inline) return;
  const body = document.getElementById(`${inline.key}-body`);
  body?.focus();
  body?.scrollIntoView?.({ block: "nearest" });
}

/**
 * Reply / reply all in a thread: the reply opens under the message it answers (as in Gmail),
 * not in the dock. The same message and mode again only focuses the open reply; any other
 * saves and closes it first (one inline reply at a time; the saved draft stays in the thread).
 */
export async function openInlineReply(
  qc: QueryClient,
  threadId: string,
  messageId: string,
  mode: InlineReplyState["mode"],
) {
  const cur = useCompose.getState().inline;
  if (cur && cur.threadId === threadId && cur.anchorId === messageId && cur.mode === mode) {
    focusInline();
    return;
  }
  if (creating) return;
  await closeInline();
  await create(
    qc,
    { replyToMessageId: messageId, mode },
    { inline: { threadId, anchorId: messageId, mode } },
  );
}

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
