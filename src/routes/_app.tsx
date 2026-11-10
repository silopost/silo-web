import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isApiError } from "../api/errors";
import { connectEvents } from "../api/events";
import { keys } from "../api/keys";
import { sessionQuery } from "../api/queries/session";
import { useLabels } from "../api/queries/labels";
import { useSettings } from "../api/queries/settings";
import { useActiveAccount } from "../features/account";
import { ComposeDock } from "../features/compose/ComposeDock";
import { LeftNav } from "../features/nav/LeftNav";
import { setNotificationNavigator } from "../features/notifications/desktop";
import { Banners } from "../features/sync/Banners";
import { VersionBanner } from "../features/sync/VersionBanner";
import { Snackbar } from "../features/toasts/Snackbar";
import { TopBar } from "../features/topbar/TopBar";
import { applyServerLocale, t, useLocale } from "../lib/i18n";
import { GoToLabelDialog } from "../features/labels/GoToLabelDialog";
import { ShortcutsHelpDialog } from "../shortcuts/ShortcutsHelpDialog";
import { useGlobalShortcuts } from "../shortcuts/useShortcuts";
import { loadOfflineSession } from "../pwa/offlineCache";
import { usePrefs } from "../state/ui";

/** The session comes from the offline snapshot; GET /session again once back online. */
let offlineSnapshot = false;

function useSessionAfterOffline() {
  const qc = useQueryClient();
  useEffect(() => {
    const online = () => {
      if (!offlineSnapshot) return;
      offlineSnapshot = false;
      void qc.invalidateQueries({ queryKey: keys.session });
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [qc]);
}

export const Route = createFileRoute("/_app")({
  // Session guard: no session → /login (plan 6.2); the session also provides the CSRF token.
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(sessionQuery);
    } catch (err) {
      if (isApiError(err, 401))
        throw redirect({ to: "/login", search: { redirect: location.href } });
      // Server unreachable (offline PWA): open the cached mail with the last session snapshot.
      const snapshot = isApiError(err) ? null : loadOfflineSession();
      if (!snapshot) throw err;
      context.queryClient.setQueryData(keys.session, snapshot);
      applyServerLocale(snapshot.settings?.language);
      offlineSnapshot = true;
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
        className="rounded-full bg-primary px-4 py-2 text-on-primary"
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

/** settings.language of the server (this tab, another device: settings.updated) wins. */
function useServerLocale() {
  const language = useSettings()?.language;
  useEffect(() => applyServerLocale(language), [language]);
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

/** "Inbox (3) – dev1@silo.test – Silo": the active account of the tab (label.counts). */
function useDocumentTitle() {
  const account = useActiveAccount();
  const locale = useLocale();
  const unread = useLabels(account?.id).find((l) => l.id === "INBOX")?.threadsUnread ?? 0;
  useEffect(() => {
    if (!account) return;
    document.title = `${t.inboxTitle}${unread > 0 ? ` (${unread})` : ""} – ${account.email} – ${t.appName}`;
  }, [account, unread, locale]);
}

function AppLayout() {
  const qc = useQueryClient();
  useEffect(() => connectEvents(qc), [qc]);
  useDensityAttribute();
  useServerLocale();
  useNotificationNavigator();
  useDocumentTitle();
  useGlobalShortcuts();
  useSessionAfterOffline();

  return (
    <div className="flex h-full flex-col bg-surface">
      <VersionBanner />
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
