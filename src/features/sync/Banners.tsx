import * as Progress from "@radix-ui/react-progress";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { formatCount } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useConnection } from "../../state/connection";
import { useAccountIndex, useActiveAccount } from "../account";
import { providerOf, startOAuth } from "../account/oauth";
import { toast } from "../../state/toasts";
import { isInitialSync, progressPercent, useResync, useSyncStatus } from "./useSync";

/** Silo itself unreachable: SSE, polling and /meta fail. */
function OfflineBanner() {
  const connection = useConnection((s) => s.state);
  if (connection !== "offline") return null;
  return <div className="bg-warn-bg px-4 py-2 text-warn-ink">{t.siloOffline}</div>;
}

/** Mail server offline or password rejected (plan 5.7); reading and actions keep working. */
function AccountErrorBanner() {
  const status = useSyncStatus();
  const account = useActiveAccount();
  const resync = useResync();
  const index = useAccountIndex();
  const returnTo = useLocation().pathname;
  const oauthProvider = account?.authType === "xoauth2" ? providerOf(account.provider) : null;
  const reauth = useMutation({
    mutationFn: () => startOAuth(oauthProvider!, { returnTo, account }),
    onError: () => toast(t.genericError),
  });
  if (!status) return null;
  if (status.state === "auth_failed") {
    // Losing the account's authorization is announced at once (plan 6.7).
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-wrap items-center gap-x-3 bg-warn-bg px-4 py-2 text-warn-ink"
      >
        {oauthProvider ? (
          <>
            <span>{t.authFailedOAuth(account?.email ?? status.email)}</span>
            <button
              type="button"
              disabled={reauth.isPending}
              onClick={() => reauth.mutate()}
              className="font-medium underline"
            >
              {t.reauthorize}
            </button>
          </>
        ) : (
          <>
            <span>{t.authFailedText(account?.email ?? status.email)}</span>
            <Link
              to="/u/$account/settings/accounts"
              params={{ account: index }}
              className="font-medium underline"
            >
              {t.updatePassword}
            </Link>
          </>
        )}
      </div>
    );
  }
  if (status.state !== "backoff") return null;
  return (
    <div className="flex items-center gap-2 bg-warn-bg px-4 py-2 text-warn-ink">
      <span>
        {t.mailServerOffline(account?.imapHost ?? status.email)}{" "}
        {status.pendingOps > 0 && t.pendingOps(status.pendingOps)}
      </span>
      <button
        type="button"
        onClick={() => resync.mutate()}
        disabled={resync.isPending}
        className="font-medium underline"
      >
        {t.retryNow}
      </button>
    </div>
  );
}

function InitialSyncBanner() {
  const status = useSyncStatus();
  if (!status || !isInitialSync(status)) return null;
  const { messagesDone, messagesTotal } = status.initialSync;
  const pct = progressPercent(status);
  return (
    <div className="flex flex-col gap-1 border-b border-line px-4 py-2">
      <span>{t.initialSync(formatCount(messagesDone), formatCount(messagesTotal))}</span>
      <Progress.Root
        value={pct}
        aria-label={t.initialSyncLabel}
        className="h-1 overflow-hidden rounded bg-line"
      >
        <Progress.Indicator
          className="h-full bg-primary transition-[width]"
          style={{ width: `${pct ?? 0}%` }}
        />
      </Progress.Root>
    </div>
  );
}

/** Banners above the list (plan 6.3), in a polite live region (plan 6.7). */
export function Banners() {
  return (
    <div aria-live="polite">
      <OfflineBanner />
      <AccountErrorBanner />
      <InitialSyncBanner />
    </div>
  );
}
