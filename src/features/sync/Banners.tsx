import * as Progress from "@radix-ui/react-progress";
import { formatCount } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useConnection } from "../../state/connection";
import { useActiveAccount } from "../account";
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
  if (!status) return null;
  if (status.state === "auth_failed") {
    return (
      <div role="alert" className="bg-warn-bg px-4 py-2 text-warn-ink">
        {t.authFailedBanner}
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
