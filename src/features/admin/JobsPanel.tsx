import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../api/client";
import { call, isApiError } from "../../api/errors";
import {
  adminAccountsQuery,
  adminJobsQuery,
  adminKeys,
  type JobStatus,
} from "../../api/queries/admin";
import type { AdminJob } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { formatFullDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { QueryView } from "./common";
import { outline, td, th } from "./styles";

export type JobsSearch = { status?: JobStatus; accountId?: string };

const ERROR_PREVIEW = 80;

/**
 * Administracja → Zadania (plan 5.7 "Nieudane operacje"): the job queue filtered by state
 * (dead by default, pending) and account, refreshed every 30 s while the tab is visible;
 * "Ponów" (POST /admin/jobs/{id}/retry) and "Usuń" (DELETE), both confirmed.
 */
export function JobsPanel({ search }: { search: JobsSearch }) {
  const status = search.status ?? "dead";
  const accountId = search.accountId;
  const navigate = useNavigate();
  const jobs = useQuery(adminJobsQuery(status, accountId));
  const accounts = useQuery(adminAccountsQuery).data ?? [];
  const [confirm, setConfirm] = useState<{ kind: "retry" | "discard"; job: AdminJob } | null>(null);
  const qc = useQueryClient();

  const act = useMutation({
    mutationFn: async ({ kind, job }: { kind: "retry" | "discard"; job: AdminJob }) => {
      const params = { params: { path: { id: job.id } } };
      if (kind === "retry") await call(api.POST("/admin/jobs/{id}/retry", params));
      else await call(api.DELETE("/admin/jobs/{id}", params));
      return kind;
    },
    onSuccess: (kind) => toast(kind === "retry" ? t.admin.retried : t.admin.discarded),
    onError: (err) => {
      if (isApiError(err, 404)) toast(t.admin.jobGone);
      else if (!isApiError(err, 429)) toast(t.genericError);
    },
    onSettled: () => {
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: adminKeys.all });
    },
  });

  const setSearch = (next: JobsSearch) =>
    void navigate({
      to: "/u/$account/admin/jobs",
      params: (p: { account?: string }) => ({ account: p.account ?? "0" }),
      search: {
        ...(next.status && next.status !== "dead" ? { status: next.status } : {}),
        ...(next.accountId ? { accountId: next.accountId } : {}),
      },
      replace: true,
    });

  const accountName = (job: AdminJob) => {
    if (!job.accountId) return t.admin.instanceWide;
    const a = accounts.find((x) => x.id === job.accountId);
    return a ? `${a.email} (${a.userEmail})` : job.accountId;
  };

  const cols = [
    t.admin.id,
    t.admin.kind,
    t.admin.account,
    t.admin.attempts,
    t.admin.lastError,
    t.admin.runAt,
    t.admin.created,
  ];

  return (
    <div>
      <h2 className="mb-3 text-lg">{t.admin.tabs.jobs}</h2>
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t.admin.status}</span>
          <select
            value={status}
            onChange={(e) => setSearch({ status: e.target.value as JobStatus, accountId })}
            className="rounded border border-line px-2 py-1"
          >
            <option value="dead">{t.admin.statuses.dead}</option>
            <option value="pending">{t.admin.statuses.pending}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t.admin.account}</span>
          <select
            value={accountId ?? ""}
            onChange={(e) => setSearch({ status, accountId: e.target.value || undefined })}
            className="rounded border border-line px-2 py-1"
          >
            <option value="">{t.admin.allAccounts}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email} ({a.userEmail})
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-ink-muted">{t.admin.limitHint}</p>
      </div>
      <QueryView query={jobs}>
        {(list) =>
          list.length === 0 ? (
            <p role="status">{t.admin.noJobs}</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                {`${t.admin.tabs.jobs}: ${t.admin.statuses[status]}`}
              </caption>
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c} scope="col" className={th}>
                      {c}
                    </th>
                  ))}
                  <th scope="col" className={th}>
                    <span className="sr-only">{t.admin.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((job) => (
                  <tr key={job.id}>
                    <th scope="row" className={`${td} text-left font-mono font-normal`}>
                      {job.id}
                    </th>
                    <td className={td}>{job.kind}</td>
                    <td className={td}>{accountName(job)}</td>
                    <td className={`${td} text-right`}>
                      {job.attempts}/{job.maxAttempts}
                    </td>
                    <td className={`${td} max-w-80`}>
                      {job.lastError ? (
                        <span title={job.lastError} className="block truncate">
                          {job.lastError.length > ERROR_PREVIEW
                            ? `${job.lastError.slice(0, ERROR_PREVIEW)}…`
                            : job.lastError}
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatFullDate(job.runAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatFullDate(job.createdAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          aria-label={t.admin.retryOf(job.id)}
                          onClick={() => setConfirm({ kind: "retry", job })}
                          className={outline}
                        >
                          {t.admin.retry}
                        </button>
                        <button
                          type="button"
                          aria-label={t.admin.discardOf(job.id)}
                          onClick={() => setConfirm({ kind: "discard", job })}
                          className={outline}
                        >
                          {t.admin.discard}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryView>
      {confirm && (
        <ConfirmDialog
          open
          title={
            confirm.kind === "retry"
              ? t.admin.retryTitle(confirm.job.id)
              : t.admin.discardTitle(confirm.job.id)
          }
          body={confirm.kind === "retry" ? t.admin.retryBody : t.admin.discardBody}
          confirmLabel={confirm.kind === "retry" ? t.admin.retry : t.admin.discard}
          busy={act.isPending}
          onConfirm={() => act.mutate(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
