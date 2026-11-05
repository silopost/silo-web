import * as Popover from "@radix-ui/react-popover";
import { IconButton } from "../../components/IconButton";
import type { IconName } from "../../components/Icon";
import { formatFullDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useConnection } from "../../state/connection";
import { isInitialSync, progressPercent, useResync, useSyncStatus } from "./useSync";

/** Cloud icon in TopBar: synced / syncing + % / offline / error, with details (plan 6.3). */
export function SyncStatusIndicator() {
  const status = useSyncStatus();
  const connection = useConnection((s) => s.state);
  const resync = useResync();
  if (!status) return null;

  let icon: IconName = "cloudDone";
  let label: string = t.syncLive;
  if (connection === "offline" || status.state === "backoff") {
    icon = "cloudOff";
    label = t.syncOffline;
  } else if (status.state === "auth_failed") {
    icon = "error";
    label = t.syncAuthFailed;
  } else if (isInitialSync(status) || status.state !== "live") {
    icon = "sync";
    label = t.syncRunning(isInitialSync(status) ? progressPercent(status) : null);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton icon={icon} label={`${t.syncStatus}: ${label}`} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="z-50 w-72 rounded-lg bg-panel p-4 shadow-lg"
        >
          <p className="font-medium">{label}</p>
          <p className="text-ink-muted">{status.email}</p>
          {status.lastSyncAt && (
            <p className="mt-2 text-ink-muted">
              {t.lastSync}: {formatFullDate(status.lastSyncAt)}
            </p>
          )}
          {status.pendingOps > 0 && <p className="mt-2">{t.pendingOps(status.pendingOps)}</p>}
          {status.error && <p className="mt-2 text-error-ink">{status.error}</p>}
          <button
            type="button"
            onClick={() => resync.mutate()}
            disabled={resync.isPending}
            className="mt-3 rounded-full border border-line px-4 py-1 font-medium text-primary hover:bg-hover"
          >
            {t.syncNow}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
