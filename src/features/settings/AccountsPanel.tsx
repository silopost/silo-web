import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { call, isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { syncStatusQuery } from "../../api/queries/syncStatus";
import type { Account } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { useSession } from "../account";

/**
 * "Konta" (minimal): the accounts with their sync state, whether the server keeps IMAP keywords
 * (plan 3.7) and "Odbuduj cache" = POST /accounts/{id}/resync {mode: rebuild}.
 */
export function AccountsPanel() {
  const accounts = useSession()?.accounts ?? [];
  return (
    <div className="max-w-4xl">
      <h2 className="mb-2 text-lg">{t.accountsPanel.title}</h2>
      <ul className="divide-y divide-line border-y border-line">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
      </ul>
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  const qc = useQueryClient();
  const status = useQuery(syncStatusQuery(account.id)).data;
  const [confirm, setConfirm] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const rebuild = useMutation({
    mutationFn: () =>
      call(
        api.POST("/accounts/{id}/resync", {
          params: { path: { id: account.id } },
          body: { mode: "rebuild" },
        }),
      ),
    onSuccess: () => {
      setBlocked(false);
      toast(t.accountsPanel.rebuildStarted);
      void qc.invalidateQueries({ queryKey: keys.syncStatus(account.id) });
    },
    onError: (err) => {
      if (isApiError(err, 409) && err.code === "rebuild_blocked") setBlocked(true);
      else toast(t.genericError);
    },
    onSettled: () => setConfirm(false),
  });
  const state = status?.state ?? account.state;

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4" aria-label={account.email}>
      <div className="min-w-64 flex-1">
        <div className="font-medium">{account.displayName || account.email}</div>
        <div className="text-sm text-ink-muted">{account.email}</div>
        <div className="text-sm">{t.accountsPanel.states[state] ?? state}</div>
        {status && (
          <div className="text-sm">
            {t.accountsPanel.keywords}:{" "}
            {status.keywordsSupported ? t.accountsPanel.keywordsYes : t.accountsPanel.keywordsNo}
          </div>
        )}
        {status && status.pendingOps > 0 && (
          <div className="text-sm text-ink-muted">
            {t.accountsPanel.pendingOps(status.pendingOps)}
          </div>
        )}
        {blocked && (
          <p role="alert" className="mt-1 text-sm text-error-ink">
            {t.accountsPanel.rebuildBlocked}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover"
      >
        {t.accountsPanel.rebuild}
      </button>
      <ConfirmDialog
        open={confirm}
        title={t.accountsPanel.rebuildTitle(account.email)}
        body={t.accountsPanel.rebuildBody}
        confirmLabel={t.accountsPanel.rebuild}
        busy={rebuild.isPending}
        onConfirm={() => rebuild.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </li>
  );
}
