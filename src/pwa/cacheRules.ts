/**
 * What the service worker may keep for offline reading (plan 1, 7 Faza 5 "odczyt z cache"):
 * GET answers of thread lists, threads, labels and message bodies only. Never the session,
 * /meta, the event stream or anything a mutation returns. Shared by src/sw.ts and its tests.
 */

/** Cache Storage name of the API answers; cleared on sign-out and session loss. */
export const API_CACHE = "silo-api-v1";

/** Entries kept in API_CACHE (lists, threads, bodies together) and their age limit. */
export const API_CACHE_MAX_ENTRIES = 200;
export const API_CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** Seconds NetworkFirst waits for the server before answering from the cache. */
export const API_NETWORK_TIMEOUT_SECONDS = 3;

const CACHEABLE = [
  /^\/api\/v1\/threads$/,
  /^\/api\/v1\/threads\/[^/]+$/,
  /^\/api\/v1\/labels$/,
  /^\/api\/v1\/labels\/[^/]+$/,
  /^\/api\/v1\/messages\/[^/]+\/html$/,
];

/** Whether a request of this origin may be answered from (and stored in) API_CACHE. */
export function isCacheableApiRequest(url: URL, method: string, origin: string): boolean {
  if (method !== "GET" || url.origin !== origin) return false;
  return CACHEABLE.some((re) => re.test(url.pathname));
}

/** Navigations that get the cached index.html (SPA routes), not /api/* (OAuth callbacks). */
export function isAppNavigation(url: URL): boolean {
  return !url.pathname.startsWith("/api/");
}
