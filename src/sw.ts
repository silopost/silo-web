/// <reference lib="webworker" />
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import {
  API_CACHE,
  API_CACHE_MAX_AGE_SECONDS,
  API_CACHE_MAX_ENTRIES,
  API_NETWORK_TIMEOUT_SECONDS,
  isAppNavigation,
  isCacheableApiRequest,
} from "./pwa/cacheRules";

/**
 * Service worker of silo-web (PWA, plan 1 and 7 Faza 5): the app shell from the precache,
 * index.html for every app route, and read-only API answers (src/pwa/cacheRules.ts) network
 * first with the cache as the offline fallback. No domain logic: mutations, the session and
 * the event stream always go to the network, and offline actions behave as without it.
 */
declare const self: ServiceWorkerGlobalScope;

// Build assets and index.html, injected by vite-plugin-pwa (injectManifest).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every SPA route opens index.html from the precache (offline too); /api/* is never a page.
registerRoute(
  ({ request, url }) => request.mode === "navigate" && isAppNavigation(url),
  createHandlerBoundToURL("index.html"),
);

registerRoute(
  ({ url, request }) => isCacheableApiRequest(url, request.method, self.location.origin),
  new NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: API_NETWORK_TIMEOUT_SECONDS,
    plugins: [
      new ExpirationPlugin({
        maxEntries: API_CACHE_MAX_ENTRIES,
        maxAgeSeconds: API_CACHE_MAX_AGE_SECONDS,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// registerType "prompt": the page asks the waiting worker to take over ("Odśwież").
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});
