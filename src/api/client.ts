import createClient, { type Middleware } from "openapi-fetch";
import { version } from "../../package.json";
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

export const api = createClient<paths>({
  baseUrl: "/api/v1",
  credentials: "same-origin",
  // Resolve fetch per call so test servers (msw) installed later are honoured.
  fetch: (request) => globalThis.fetch(request),
});

api.use(headers);
