import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { sessionQuery } from "../api/queries/session";
import type { Account, Session } from "../api/types";

/** The session; _app's guard loads it before any page of the app renders. */
export function useSession(): Session | undefined {
  return useQuery(sessionQuery).data;
}

/** Account index of the URL (/u/<index>/…, plan 6.2); 0 outside account routes. */
export function useAccountIndex(): string {
  const params = useParams({ strict: false }) as { account?: string };
  return params.account ?? "0";
}

/** The account of the URL, by position in the session's account list. */
export function useActiveAccount(): Account | undefined {
  const index = Number(useAccountIndex());
  return useSession()?.accounts?.[index];
}
