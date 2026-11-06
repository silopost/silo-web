import { api } from "../../api/client";
import { call } from "../../api/errors";
import type { Account } from "../../api/types";

/** OAuth2 providers of silo-server (GET /meta oauthProviders, POST /oauth/{provider}/start). */
export type OAuthProvider = "google" | "microsoft";

export const oauthConfig = {
  /** Top-level navigation to the provider; tests replace it. */
  assign: (url: string) => window.location.assign(url),
};

/** The OAuth provider of a discovered or stored account (Account.provider / Discovery.provider). */
export function providerOf(provider: string | undefined): OAuthProvider | null {
  if (provider === "gmail") return "google";
  if (provider === "microsoft") return "microsoft";
  return null;
}

/**
 * "Zaloguj przez Google / Microsoft" (and "Zaloguj ponownie" with accountId): the server
 * returns the provider's authorization URL; the browser leaves for it and comes back through
 * the callback to returnTo with ?oauth=ok&accountId= or ?oauth=error&code=.
 */
export async function startOAuth(
  provider: OAuthProvider,
  opts: { returnTo: string; account?: Pick<Account, "id"> },
): Promise<void> {
  const { url } = await call(
    api.POST("/oauth/{provider}/start", {
      params: { path: { provider } },
      body: { returnTo: opts.returnTo, ...(opts.account ? { accountId: opts.account.id } : {}) },
    }),
  );
  oauthConfig.assign(url);
}
