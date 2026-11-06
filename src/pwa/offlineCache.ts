import type { Session } from "../api/types";
import { API_CACHE } from "./cacheRules";

const SNAPSHOT_KEY = "silo.offlineSession";

/**
 * Removes the API answers the service worker kept (sign-out, session expired, sign-in of
 * another user) together with the offline session snapshot.
 */
export async function clearOfflineData(): Promise<void> {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Storage disabled: nothing was kept.
  }
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(API_CACHE);
  } catch {
    // Cache Storage unavailable (private mode): nothing to clear.
  }
}

/**
 * What the app shell needs to render cached lists after a reload without the server: the
 * user, accounts and settings of GET /session, without the CSRF token (offline nothing is
 * sent anyway). Not the session itself, which the service worker never caches.
 */
export function saveOfflineSession(session: Session): void {
  const { user, accounts, settings } = session;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ user, accounts, settings }));
  } catch {
    // Quota or disabled storage: offline reading just needs the server then.
  }
}

/** The snapshot as a session with an empty CSRF token, or null. */
export function loadOfflineSession(): Session | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Omit<Session, "csrfToken">;
    if (!data.user || !data.settings) return null;
    return { ...data, csrfToken: "" };
  } catch {
    return null;
  }
}
