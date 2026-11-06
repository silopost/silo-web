import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { adminAccountsQuery } from "../../api/queries/admin";
import { formatFullDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { useAccountIndex } from "../account";
import { QueryView, StateChip } from "./common";
import { td, th } from "./styles";

/**
 * Administracja → Konta: every mail account of the instance with its owner, sync state, last
 * sync, error and queued / dead operations (the dead ones link to Zadania of that account).
 */
export function AdminAccountsPanel() {
  const accounts = useQuery(adminAccountsQuery);
  const index = useAccountIndex();
  const cols = [
    t.admin.user,
    t.admin.email,
    t.admin.host,
    t.admin.authType,
    t.admin.state,
    t.admin.lastSync,
    t.admin.error,
    t.admin.pendingOps,
    t.admin.deadOps,
  ];
  return (
    <div>
      <h2 className="mb-3 text-lg">{t.admin.tabs.accounts}</h2>
      <QueryView query={accounts}>
        {(list) => (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{t.admin.tabs.accounts}</caption>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} scope="col" className={th}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className={td}>{a.userEmail}</td>
                  <th scope="row" className={`${td} text-left font-medium`}>
                    {a.email}
                  </th>
                  <td className={td}>{a.imapHost}</td>
                  <td className={td}>{t.admin.authTypes[a.authType] ?? a.authType}</td>
                  <td className={td}>
                    <StateChip state={a.state} />
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {a.lastSyncAt ? formatFullDate(a.lastSyncAt) : t.admin.never}
                  </td>
                  <td className={`${td} max-w-64 truncate`} title={a.error ?? undefined}>
                    {a.error ?? "–"}
                  </td>
                  <td className={`${td} text-right`}>{a.pendingOps}</td>
                  <td className={`${td} text-right`}>
                    {a.deadOps > 0 ? (
                      <Link
                        to="/u/$account/admin/jobs"
                        params={{ account: index }}
                        search={{ status: "dead", accountId: a.id }}
                        aria-label={t.admin.deadOpsLink(a.deadOps, a.email)}
                        className="font-medium text-error-ink underline"
                      >
                        {a.deadOps}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </QueryView>
    </div>
  );
}
