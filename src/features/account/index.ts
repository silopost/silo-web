import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { labelsQuery } from "../../api/queries/labels";
import { sessionQuery } from "../../api/queries/session";
import { usePatchSettings, useSettings } from "../../api/queries/settings";
import type { Account, Session } from "../../api/types";
import { resolveLabelSlug } from "../../lib/labels";

/** The session; _app's guard loads it before any page of the app renders. */
export function useSession(): Session | undefined {
  return useQuery(sessionQuery).data;
}

/** Account index of the URL (/u/<index>/…, plan 6.2); 0 outside account routes. */
export function useAccountIndex(): string {
  const params = useParams({ strict: false }) as { account?: string };
  return params.account ?? "0";
}

/** The account of the URL: /u/<n> is the account with Account.position n. */
export function useActiveAccount(): Account | undefined {
  const index = Number(useAccountIndex());
  return useSession()?.accounts?.find((a) => a.position === index);
}

const noAccounts: Account[] = [];

/** The user's accounts in the order of Account.position (AccountSwitcher, `g 1..9`, "Od"). */
export function useAccounts(): Account[] {
  const accounts = useSession()?.accounts ?? noAccounts;
  return accounts.length < 2 ? accounts : [...accounts].sort((a, b) => a.position - b.position);
}

/**
 * Unread threads in INBOX per account id, from GET /labels?accountId= of every account (one
 * ['labels', accountId] query each, kept current by label.counts of any account).
 */
export function useInboxUnread(accounts: Account[]): Record<string, number> {
  return useQueries({
    queries: accounts.map((a) => ({
      ...labelsQuery(a.id),
      select: (d: { labels?: { id: string; threadsUnread: number }[] | null }) =>
        d.labels?.find((l) => l.id === "INBOX")?.threadsUnread ?? 0,
    })),
    combine: (results) => Object.fromEntries(accounts.map((a, i) => [a.id, results[i]?.data ?? 0])),
  });
}

/**
 * Switches the tab to another account: /u/<position>/<label>, keeping a system view (a user
 * label l_… belongs to one account only, so it falls back to inbox), and remembers the choice
 * with PATCH /settings {activeAccountId}, so that other tabs and devices start with it.
 */
export function useSwitchAccount(): (target: Account, label?: string) => void {
  const navigate = useNavigate();
  const settings = useSettings();
  const { mutate: patchSettings } = usePatchSettings();
  return useCallback(
    (target, label) => {
      const keep = label && resolveLabelSlug(label).kind === "system" ? label : "inbox";
      void navigate({
        to: "/u/$account/$label",
        params: { account: String(target.position), label: keep },
      });
      if (settings?.activeAccountId !== target.id) patchSettings({ activeAccountId: target.id });
    },
    [navigate, settings?.activeAccountId, patchSettings],
  );
}
