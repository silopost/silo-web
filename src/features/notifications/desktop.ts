import type { QueryClient } from "@tanstack/react-query";
import { keys } from "../../api/keys";
import { sessionQuery } from "../../api/queries/session";
import type { Session, Settings } from "../../api/types";
import { t } from "../../lib/i18n";

export type PermissionResult = NotificationPermission | "unsupported";

/** Asks the browser for its permission (each client asks for itself, plan 5.4). */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Opens a thread of an account (set by the app shell, which owns the router). */
let openThread: (accountPosition: number, threadId: string) => void = () => {};
export function setNotificationNavigator(fn: typeof openThread): void {
  openThread = fn;
}

const tabActive = () => document.visibilityState === "visible" && document.hasFocus();

type MessageNew = {
  accountId?: string;
  threadId?: string;
  labelIds?: unknown;
  from?: { name?: string; email?: string };
  subject?: string;
  snippet?: string;
};

/**
 * message.new → a desktop notification (plan 5.4) when the setting is on, the message is in
 * INBOX, the browser allows it and the tab is in the background. A click opens the thread.
 */
export function notifyNewMessage(qc: QueryClient, data: MessageNew): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const session = qc.getQueryData<Session>(sessionQuery.queryKey);
  const settings = qc.getQueryData<Settings>(keys.settings) ?? session?.settings;
  if (!settings?.desktopNotifications) return;
  if (!Array.isArray(data.labelIds) || !data.labelIds.includes("INBOX")) return;
  if (tabActive()) return;
  const account = session?.accounts?.find((a) => a.id === data.accountId);
  const from = data.from?.name || data.from?.email;
  const n = new Notification(from ? t.newMailFrom(from) : t.newMail, {
    body: [data.subject, data.snippet].filter(Boolean).join("\n"),
    tag: data.threadId,
  });
  n.onclick = () => {
    window.focus();
    n.close();
    if (account && data.threadId) openThread(account.position, data.threadId);
  };
}
