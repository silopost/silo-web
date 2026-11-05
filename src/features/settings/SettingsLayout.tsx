import { Link, Outlet } from "@tanstack/react-router";
import { t } from "../../lib/i18n";
import { useAccountIndex } from "../account";

const TABS = ["general", "labels", "filters", "accounts"] as const;
export type SettingsTab = (typeof TABS)[number];

const PATHS = {
  general: "/u/$account/settings/general",
  labels: "/u/$account/settings/labels",
  filters: "/u/$account/settings/filters",
  accounts: "/u/$account/settings/accounts",
} as const;

/** Settings (plan 6.3): Gmail-like tabs over the panels, each tab its own URL. */
export function SettingsLayout() {
  const account = useAccountIndex();
  return (
    <section aria-labelledby="settings-title" className="flex min-h-0 flex-1 flex-col">
      <h1 id="settings-title" className="px-6 pt-4 pb-2 text-2xl">
        {t.settingsTitle}
      </h1>
      <nav aria-label={t.settingsTitle} className="border-b border-line px-4">
        <ul className="flex gap-1">
          {TABS.map((tab) => (
            <li key={tab}>
              <Link
                to={PATHS[tab]}
                params={{ account }}
                activeProps={{ "aria-current": "page", className: "border-primary text-primary" }}
                inactiveProps={{ className: "border-transparent" }}
                className="inline-block border-b-2 px-4 py-2 font-medium hover:bg-hover"
              >
                {t.settings.tabs[tab]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Outlet />
      </div>
    </section>
  );
}
