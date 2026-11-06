import { createFileRoute } from "@tanstack/react-router";
import { AccountsPanel } from "../features/settings/AccountsPanel";

/**
 * ?add opens "Dodaj konto"; ?oauth=ok&accountId= / ?oauth=error&code= is where the OAuth
 * callback of silo-server sends the browser back (returnTo).
 */
export type AccountsSearch = {
  add?: boolean;
  oauth?: "ok" | "error";
  accountId?: string;
  code?: string;
};

export const Route = createFileRoute("/_app/u/$account/settings/accounts")({
  validateSearch: (s: Record<string, unknown>): AccountsSearch => ({
    ...(s.add === true || s.add === "1" || s.add === "true" ? { add: true } : {}),
    ...(s.oauth === "ok" || s.oauth === "error" ? { oauth: s.oauth } : {}),
    ...(typeof s.accountId === "string" ? { accountId: s.accountId } : {}),
    ...(typeof s.code === "string" ? { code: s.code } : {}),
  }),
  component: AccountsPanel,
});
