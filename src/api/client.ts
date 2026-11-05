import createClient, { type Middleware } from "openapi-fetch";
import { version } from "../../package.json";
import { getCsrfToken } from "./csrf";
import type { paths } from "./schema";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const headers: Middleware = {
  onRequest({ request }) {
    request.headers.set("X-Silo-Client", `silo-web/${version}`);
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
