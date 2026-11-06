import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { setCsrfToken } from "./api/csrf";
import { isApiError } from "./api/errors";
import { setSessionLostHandler } from "./api/sessionLost";
import { keys } from "./api/keys";
import { clearOfflineData } from "./pwa/offlineCache";
import { routeTree } from "./routeTree.gen";

export type RouterContext = { queryClient: QueryClient };

/**
 * Query defaults (plan 6.4): lists and threads stale after 30 s (set per query), no retries of
 * client errors, and a 401 anywhere (expired session) sends the tab to the login page.
 */
export function createQueryClient(onUnauthorized: () => void): QueryClient {
  const handle = (err: unknown) => {
    if (isApiError(err, 401)) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (query.queryKey[0] !== keys.session[0]) handle(err);
      },
    }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) => (isApiError(err) ? err.status >= 500 && count < 2 : count < 2),
        refetchOnWindowFocus: false,
        // Run the request even when the browser says offline: the service worker may answer
        // from its cache (PWA, plan 7 Faza 5). Retries still wait for the network.
        networkMode: "offlineFirst",
      },
    },
  });
}

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: false,
    scrollRestoration: false,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

/**
 * Builds the query client and router of the app, wired so that a lost session (a 401, SSE
 * session.expired) leads to /login?redirect=<the page>, back there after signing in.
 */
export function createApp(history?: RouterHistory) {
  let router: AppRouter | undefined = undefined;
  const onSessionLost = () => {
    queryClient.removeQueries({ queryKey: keys.session });
    setCsrfToken(null);
    // Cached mail of the PWA must not outlive the session (plan 7 Faza 5).
    void clearOfflineData();
    if (router && router.state.location.pathname !== "/login") {
      const redirect = router.state.location.href;
      void router.navigate({ to: "/login", search: { redirect } });
    }
  };
  const queryClient = createQueryClient(onSessionLost);
  setSessionLostHandler(onSessionLost);
  router = createAppRouter(queryClient, history);
  return { queryClient, router };
}
