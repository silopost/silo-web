import { Link, Outlet } from "@tanstack/react-router";
import { t } from "../../lib/i18n";
import { useAccountIndex, useSession } from "../account";

const TABS = ["users", "accounts", "jobs"] as const;

const PATHS = {
  users: "/u/$account/admin/users",
  accounts: "/u/$account/admin/accounts",
  jobs: "/u/$account/admin/jobs",
} as const;

/** "Access denied": a user without isAdmin, or a 403 forbidden of /admin/*. */
export function Forbidden() {
  return (
    <div role="alert" className="p-6">
      <h2 className="text-lg font-medium">{t.admin.forbidden}</h2>
      <p className="text-ink-muted">{t.admin.forbiddenHint}</p>
    </div>
  );
}

/**
 * Administracja (plan 3.15, 5.1 /admin/*): users, every account of the instance and the job
 * queue (dead operations, plan 5.7). Tabs as in Settings, each its own URL.
 */
export function AdminLayout() {
  const account = useAccountIndex();
  const isAdmin = useSession()?.user.isAdmin ?? false;
  return (
    <section aria-labelledby="admin-title" className="flex min-h-0 flex-1 flex-col">
      <h1 id="admin-title" className="px-6 pt-4 pb-2 text-2xl">
        {t.admin.title}
      </h1>
      {isAdmin ? (
        <>
          <nav aria-label={t.admin.title} className="border-b border-line px-4">
            <ul className="flex gap-1">
              {TABS.map((tab) => (
                <li key={tab}>
                  <Link
                    to={PATHS[tab]}
                    params={{ account }}
                    activeProps={{
                      "aria-current": "page",
                      className: "border-primary text-primary",
                    }}
                    inactiveProps={{ className: "border-transparent" }}
                    className="inline-block border-b-2 px-4 py-2 font-medium hover:bg-hover"
                  >
                    {t.admin.tabs[tab]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <Outlet />
          </div>
        </>
      ) : (
        <Forbidden />
      )}
    </section>
  );
}
