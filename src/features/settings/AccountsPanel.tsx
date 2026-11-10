import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { call, isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { syncStatusQuery } from "../../api/queries/syncStatus";
import type { Account } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { useAccountIndex, useAccounts, useSession } from "../account";
import { providerOf, startOAuth } from "../account/oauth";
import { AddAccountDialog } from "./AddAccountDialog";

const outline =
  "rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover disabled:opacity-60";

/**
 * After the OAuth callback the server sends the browser back here with ?oauth=ok&accountId= or
 * ?oauth=error&code= (plan 5.1): a snackbar or an alert, fresh session and accounts, and the
 * parameters are removed from the URL. Returns the error to show.
 */
function useOAuthReturn(): [string | null, () => void] {
  const search = useSearch({ from: "/_app/u/$account/settings/accounts" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const key = search.oauth ? `${search.oauth}:${search.accountId ?? search.code ?? ""}` : null;
  // The error is derived from the URL during render (it outlives the cleaned URL).
  const [seen, setSeen] = useState<string | null>(null);
  if (key !== null && key !== seen) {
    setSeen(key);
    if (search.oauth === "error")
      setError((search.code && t.oauthResult.errors[search.code]) || t.oauthResult.unknown);
  }
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (key === null || handled.current === key) return;
    handled.current = key;
    if (search.oauth === "ok") {
      toast(t.oauthResult.ok);
      void qc.invalidateQueries({ queryKey: keys.session });
      if (search.accountId)
        void qc.invalidateQueries({ queryKey: keys.syncStatus(search.accountId) });
    }
    void navigate({
      to: ".",
      search: ({ add }: { add?: boolean }) => (add ? { add } : {}),
      replace: true,
    });
  }, [key, search.oauth, search.accountId, navigate, qc]);
  return [error, () => setError(null)];
}

/**
 * Ustawienia → Konta: the accounts with their sync state, "Dodaj konto" (discovery, test,
 * OAuth), re-authorization of OAuth accounts, password change, removal and "Odbuduj cache"
 * (POST /accounts/{id}/resync {mode: rebuild}).
 */
export function AccountsPanel() {
  const accounts = useAccounts();
  const search = useSearch({ from: "/_app/u/$account/settings/accounts" });
  const navigate = useNavigate();
  const [oauthError, clearOAuthError] = useOAuthReturn();
  const [adding, setAdding] = useState(false);
  const open = adding || search.add === true;
  const close = () => {
    setAdding(false);
    if (search.add) void navigate({ to: ".", search: {}, replace: true });
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-2 flex items-center gap-4">
        <h2 className="flex-1 text-lg">{t.accountsPanel.title}</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full bg-primary px-4 py-1.5 font-medium text-on-primary"
        >
          {t.accountsPanel.add}
        </button>
      </div>
      {oauthError && (
        <div
          role="alert"
          className="mb-2 flex items-start gap-2 bg-error-bg px-4 py-2 text-error-ink"
        >
          <span className="flex-1">{oauthError}</span>
          <button type="button" onClick={clearOAuthError} className="font-medium underline">
            {t.close}
          </button>
        </div>
      )}
      <ul className="divide-y divide-line border-y border-line">
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} />
        ))}
      </ul>
      <BackupInfo />
      <AddAccountDialog open={open} onClose={close} />
    </div>
  );
}

const BACKUP_DOC = "https://github.com/silopost/silo/blob/main/docs/admin/backup.md";

/** Static note on backups (plan 3.13): what the metadata backup holds and who runs it. */
function BackupInfo() {
  return (
    <section aria-labelledby="backup-title" className="mt-8 max-w-2xl">
      <h2 id="backup-title" className="mb-1 text-lg">
        {t.accountsPanel.backupTitle}
      </h2>
      <p className="text-sm">{t.accountsPanel.backupText}</p>
      <p className="mt-1 text-sm text-ink-muted">{t.accountsPanel.backupAdmin}</p>
      <a
        href={BACKUP_DOC}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-sm text-primary underline"
      >
        {t.accountsPanel.backupLink}
      </a>
    </section>
  );
}

function AccountRow({ account }: { account: Account }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const returnTo = useLocation().pathname;
  const index = useAccountIndex();
  const isAdmin = useSession()?.user.isAdmin ?? false;
  const status = useQuery(syncStatusQuery(account.id)).data;
  const [confirm, setConfirm] = useState<"rebuild" | "remove" | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [password, setPassword] = useState("");
  const oauthProvider = account.authType === "xoauth2" ? providerOf(account.provider) : null;

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
    onSettled: () => setConfirm(null),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      call(
        api.PATCH("/accounts/{id}", { params: { path: { id: account.id } }, body: { password } }),
      ),
    onSuccess: () => {
      toast(t.accountsPanel.passwordSaved);
      setEditingPassword(false);
      setPassword("");
      void qc.invalidateQueries({ queryKey: keys.session });
      void qc.invalidateQueries({ queryKey: keys.syncStatus(account.id) });
    },
    onError: () => toast(t.genericError),
  });

  const remove = useMutation({
    mutationFn: () => call(api.DELETE("/accounts/{id}", { params: { path: { id: account.id } } })),
    onSuccess: async () => {
      toast(t.accountsPanel.removed(account.email));
      qc.removeQueries({ queryKey: keys.labels(account.id) });
      qc.removeQueries({ queryKey: keys.threadsAll(account.id) });
      qc.removeQueries({ queryKey: keys.syncStatus(account.id) });
      await qc.refetchQueries({ queryKey: keys.session });
      // The page was of the removed account: go to the first one left.
      if (String(account.position) === index) {
        const first = qc
          .getQueryData<{ accounts?: Account[] | null }>(keys.session)
          ?.accounts?.reduce<Account | undefined>(
            (min, a) => (!min || a.position < min.position ? a : min),
            undefined,
          );
        await navigate({
          to: "/u/$account/settings/accounts",
          params: { account: String(first?.position ?? 0) },
        });
      }
    },
    onError: () => toast(t.genericError),
    onSettled: () => setConfirm(null),
  });

  const reauth = useMutation({
    mutationFn: () => startOAuth(oauthProvider!, { returnTo, account }),
    onError: () => toast(t.genericError),
  });

  const state = status?.state ?? account.state;
  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (password) changePassword.mutate();
  };

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4" aria-label={account.email}>
      <div className="min-w-64 flex-1">
        <div className="flex items-center gap-2 font-medium">
          {account.displayName || account.email}
          {account.authType === "xoauth2" && (
            <span
              title={t.accountsPanel.oauthTitle}
              className="rounded border border-line px-1.5 text-xs font-normal text-ink-muted"
            >
              {t.accountsPanel.oauth}
            </span>
          )}
        </div>
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
        {status && status.deadOps > 0 && (
          <div className="text-sm text-error-ink">
            {t.accountsPanel.deadOps(status.deadOps)}
            {isAdmin && (
              <>
                {" · "}
                <Link
                  to="/u/$account/admin/jobs"
                  params={{ account: index }}
                  search={{ status: "dead", accountId: account.id }}
                  className="font-medium underline"
                >
                  {t.accountsPanel.deadOpsAdmin}
                </Link>
              </>
            )}
          </div>
        )}
        {blocked && (
          <p role="alert" className="mt-1 text-sm text-error-ink">
            {t.accountsPanel.rebuildBlocked}
          </p>
        )}
        {editingPassword && (
          <form onSubmit={submitPassword} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="password"
              autoFocus
              required
              autoComplete="new-password"
              aria-label={t.accountsPanel.newPassword(account.email)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-line px-2 py-1"
            />
            <button
              type="submit"
              disabled={!password || changePassword.isPending}
              className="rounded-full bg-primary px-4 py-1.5 font-medium text-on-primary disabled:opacity-60"
            >
              {t.accountsPanel.savePassword}
            </button>
            <button
              type="button"
              onClick={() => setEditingPassword(false)}
              className="rounded-full px-4 py-1.5 font-medium text-primary hover:bg-hover"
            >
              {t.cancel}
            </button>
          </form>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {oauthProvider && state === "auth_failed" && (
          <button
            type="button"
            disabled={reauth.isPending}
            onClick={() => reauth.mutate()}
            className="rounded-full bg-primary px-4 py-1.5 font-medium text-on-primary disabled:opacity-60"
          >
            {t.reauthorize}
          </button>
        )}
        {account.authType === "password" && !editingPassword && (
          <button type="button" onClick={() => setEditingPassword(true)} className={outline}>
            {t.accountsPanel.changePassword}
          </button>
        )}
        <button type="button" onClick={() => setConfirm("rebuild")} className={outline}>
          {t.accountsPanel.rebuild}
        </button>
        <button type="button" onClick={() => setConfirm("remove")} className={outline}>
          {t.accountsPanel.remove}
        </button>
      </div>
      <ConfirmDialog
        open={confirm === "rebuild"}
        title={t.accountsPanel.rebuildTitle(account.email)}
        body={t.accountsPanel.rebuildBody}
        confirmLabel={t.accountsPanel.rebuild}
        busy={rebuild.isPending}
        onConfirm={() => rebuild.mutate()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "remove"}
        title={t.accountsPanel.removeTitle(account.email)}
        body={t.accountsPanel.removeBody}
        confirmLabel={t.accountsPanel.remove}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirm(null)}
      />
    </li>
  );
}
