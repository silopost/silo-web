import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";
import { setCsrfToken } from "../csrf";
import { call } from "../errors";
import { keys } from "../keys";
import { applyServerLocale } from "../../lib/i18n";
import { applyServerTheme } from "../../lib/theme";
import { saveOfflineSession } from "../../pwa/offlineCache";
import type { Session } from "../types";

/**
 * Stores the CSRF token of a session so that mutations carry it, and the offline snapshot
 * (user, accounts, settings) that lets the PWA shell open cached mail without the server, and
 * switches the UI to the language and the colour theme of the user (settings.language,
 * settings.theme, both remembered for the login).
 */
export function adoptSession(session: Session): Session {
  setCsrfToken(session.csrfToken);
  applyServerLocale(session.settings?.language);
  applyServerTheme(session.settings?.theme);
  saveOfflineSession(session);
  return session;
}

export const sessionQuery = queryOptions({
  queryKey: keys.session,
  queryFn: async ({ signal }) => adoptSession(await call(api.GET("/session", { signal }))),
  staleTime: Infinity,
  retry: false,
});
