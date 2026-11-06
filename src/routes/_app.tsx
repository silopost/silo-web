import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isApiError } from "../api/errors";
import { connectEvents } from "../api/events";
import { sessionQuery } from "../api/queries/session";
import { useLabels } from "../api/queries/labels";
import { useSettings } from "../api/queries/settings";
import { useActiveAccount } from "../features/account";
import { ComposeDock } from "../features/compose/ComposeDock";
import { LeftNav } from "../features/nav/LeftNav";
import { setNotificationNavigator } from "../features/notifications/desktop";
import { Banners } from "../features/sync/Banners";
import { Snackbar } from "../features/toasts/Snackbar";
import { TopBar } from "../features/topbar/TopBar";
import { t } from "../lib/i18n";
import { GoToLabelDialog } from "../features/labels/GoToLabelDialog";
import { ShortcutsHelpDialog } from "../shortcuts/ShortcutsHelpDialog";
import { useGlobalShortcuts } from "../shortcuts/useShortcuts";
import { usePrefs } from "../state/ui";

export const Route = createFileRoute("/_app")({
  // Session guard: no session → /login (plan 6.2); the session also provides the CSRF token.
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(sessionQuery);
    } catch (err) {
      if (isApiError(err, 401))
        throw redirect({ to: "/login", search: { redirect: location.href } });
      throw err;
    }
  },
  component: AppLayout,
  errorComponent: AppError,
});

function AppError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-3">
      <p>{t.serverUnreachable}</p>
      <button
        type="button"
        onClick={() => {
          reset();
          location.reload();
        }}
        className="rounded-full bg-primary px-4 py-2 text-white"
      >
        {t.retry}
      </button>
    </div>
  );
}

function useDensityAttribute() {
  const density = usePrefs((s) => s.density);
  // The server's setting (another device, settings.updated) wins over the local copy.
  const serverDensity = useSettings()?.density;
  useEffect(() => {
    if (serverDensity) usePrefs.getState().setDensity(serverDensity);
  }, [serverDensity]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
}

/** A click on a desktop notification opens its thread in this tab. */
function useNotificationNavigator() {
  const router = useRouter();
  useEffect(() => {
    setNotificationNavigator((position, threadId) => {
      void router.navigate({
        to: "/u/$account/$label/$threadId",
        params: { account: String(position), label: "inbox", threadId },
      });
    });
    return () => setNotificationNavigator(() => {});
  }, [router]);
}

/** "Odebrane (3) – dev1@silo.test – Silo": the active account of the tab (label.counts). */
function useDocumentTitle() {
  const account = useActiveAccount();
  const unread = useLabels(account?.id).find((l) => l.id === "INBOX")?.threadsUnread ?? 0;
  useEffect(() => {
    if (!account) return;
    document.title = `${t.inboxTitle}${unread > 0 ? ` (${unread})` : ""} – ${account.email} – ${t.appName}`;
  }, [account, unread]);
}

function AppLayout() {
  const qc = useQueryClient();
  useEffect(() => connectEvents(qc), [qc]);
  useDensityAttribute();
  useNotificationNavigator();
  useDocumentTitle();
  useGlobalShortcuts();

  return (
    <div className="flex h-full flex-col bg-surface">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftNav />
        <main className="mr-4 mb-4 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-panel">
          <Banners />
          <Outlet />
        </main>
      </div>
      <ComposeDock />
      <Snackbar />
      <ShortcutsHelpDialog />
      <GoToLabelDialog />
    </div>
  );
}
