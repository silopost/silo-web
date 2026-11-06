import createClient, { type Middleware } from "openapi-fetch";
import { version } from "../../package.json";
import { showRateLimited } from "../state/toasts";
import { getCsrfToken } from "./csrf";
import type { paths } from "./schema";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function tabId(): string {
  const key = "silo.tabId";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID().slice(0, 8);
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID().slice(0, 8);
  }
}

/**
 * Id of this browser tab, sent as X-Silo-Client. The server echoes it as `origin` in the events
 * the request causes, so the tab can recognise its own changes (plan 5.4). It survives reloads
 * of the tab (sessionStorage) but differs between tabs.
 */
export const clientId = `silo-web/${version}#${tabId()}`;

const headers: Middleware = {
  onRequest({ request }) {
    request.headers.set("X-Silo-Client", clientId);
    const csrf = getCsrfToken();
    if (csrf && !SAFE_METHODS.has(request.method)) {
      request.headers.set("X-Silo-CSRF", csrf);
    }
    return request;
  },
};

/**
 * One handler for 429 rate_limited (limits per IP, discovery per user): a snackbar with the
 * time from Retry-After. Sign-in shows its own message, the event stream falls back to polling.
 */
const rateLimit: Middleware = {
  onResponse({ request, response }) {
    if (response.status !== 429) return;
    const path = new URL(request.url).pathname;
    if (path.endsWith("/api/v1/session") || path.includes("/api/v1/events")) return;
    const header = response.headers.get("Retry-After");
    showRateLimited(header && /^\d+$/.test(header) ? Number(header) : undefined);
  },
};

export const api = createClient<paths>({
  baseUrl: "/api/v1",
  credentials: "same-origin",
  // Resolve fetch per call so test servers (msw) installed later are honoured.
  fetch: (request) => globalThis.fetch(request),
});

api.use(headers, rateLimit);
