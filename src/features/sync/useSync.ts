import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { call } from "../../api/errors";
import { keys } from "../../api/keys";
import { syncStatusQuery } from "../../api/queries/syncStatus";
import type { SyncStatus } from "../../api/types";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { useActiveAccount } from "../account";

export function useSyncStatus(): SyncStatus | undefined {
  const account = useActiveAccount();
  return useQuery({ ...syncStatusQuery(account?.id ?? ""), enabled: !!account }).data;
}

/** "Synchronizuj teraz" / "Ponów teraz" / Refresh: an incremental resync of the account. */
export function useResync() {
  const account = useActiveAccount();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      call(
        api.POST("/accounts/{id}/resync", {
          params: { path: { id: account!.id } },
          body: { mode: "incremental" },
        }),
      ),
    onSuccess: () => {
      if (!account) return;
      void qc.invalidateQueries({ queryKey: keys.syncStatus(account.id) });
      void qc.invalidateQueries({ queryKey: keys.threadsAll(account.id) });
      void qc.invalidateQueries({ queryKey: keys.labels(account.id) });
    },
    onError: () => toast(t.genericError),
  });
}

/** Initial sync progress in percent, or null while totals are unknown. */
export function progressPercent(s: SyncStatus): number | null {
  const { messagesDone, messagesTotal } = s.initialSync;
  if (!messagesTotal) return null;
  return Math.min(100, Math.floor((messagesDone / messagesTotal) * 100));
}

export function isInitialSync(s: SyncStatus): boolean {
  return s.state === "initial_sync" || (!s.initialSyncDoneAt && s.initialSync.phase !== "done");
}
