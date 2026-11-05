import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";
import { setCsrfToken } from "../csrf";
import { call } from "../errors";
import { keys } from "../keys";
import type { Session } from "../types";

/** Stores the CSRF token of a session so that mutations carry it. */
export function adoptSession(session: Session): Session {
  setCsrfToken(session.csrfToken);
  return session;
}

export const sessionQuery = queryOptions({
  queryKey: keys.session,
  queryFn: async ({ signal }) => adoptSession(await call(api.GET("/session", { signal }))),
  staleTime: Infinity,
  retry: false,
});
