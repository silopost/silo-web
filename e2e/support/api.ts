import { request, type APIRequestContext } from "@playwright/test";
import { e2eEnv, type DevAccount } from "./env";

/**
 * Direct calls to silo-server for setup and cleanup that the UI does not need to show: a bearer
 * session (ADR 0007, no CSRF/Origin), signed out again at the end. The tests themselves act
 * through the UI.
 */
export async function withApi<T>(
  account: DevAccount,
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  const env = e2eEnv();
  const login = await request.newContext({ baseURL: env.apiUrl });
  const res = await login.post("/api/v1/session", {
    data: {
      email: account.email,
      password: account.password,
      client: { kind: "bearer", name: "e2e cleanup" },
    },
  });
  if (!res.ok()) throw new Error(`e2e api: sign-in ${res.status()}`);
  const { token } = (await res.json()) as { token: string };
  await login.dispose();
  const api = await request.newContext({
    baseURL: env.apiUrl,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  try {
    return await fn(api);
  } finally {
    await api.delete("/api/v1/session").catch(() => undefined);
    await api.dispose();
  }
}

type LabelRow = { id: string; name: string; type: string; parentId?: string | null };

/** Deletes the user labels and folders whose name contains `marker` (children first). */
export async function deleteLabelsNamed(account: DevAccount, marker: string): Promise<number> {
  return withApi(account, async (api) => {
    const res = await api.get("/api/v1/labels");
    if (!res.ok()) return 0;
    const { labels } = (await res.json()) as { labels: LabelRow[] };
    const doomed = labels.filter(
      (l) => (l.type === "user" || l.type === "folder") && l.name.includes(marker),
    );
    const depth = (l: LabelRow): number => {
      const parent = doomed.find((p) => p.id === l.parentId);
      return parent ? depth(parent) + 1 : 0;
    };
    let n = 0;
    for (const l of [...doomed].sort((a, b) => depth(b) - depth(a))) {
      const r = await api.delete(`/api/v1/labels/${l.id}`);
      if (r.ok()) n++;
    }
    return n;
  });
}

/** Deletes the filters whose name or criteria contain `marker`. */
export async function deleteFiltersNamed(account: DevAccount, marker: string): Promise<number> {
  return withApi(account, async (api) => {
    const res = await api.get("/api/v1/filters");
    if (!res.ok()) return 0;
    const { filters } = (await res.json()) as {
      filters: { id: string; name: string; criteria: string }[];
    };
    let n = 0;
    for (const f of filters.filter((f) => f.name.includes(marker) || f.criteria.includes(marker))) {
      if ((await api.delete(`/api/v1/filters/${f.id}`)).ok()) n++;
    }
    return n;
  });
}

/** The user's settings (GET /settings). */
export async function getSettings(account: DevAccount): Promise<Record<string, unknown>> {
  return withApi(account, async (api) => (await api.get("/api/v1/settings")).json());
}

/** PATCH /settings with the given fields (JSON merge). */
export async function patchSettings(
  account: DevAccount,
  fields: Record<string, unknown>,
): Promise<void> {
  await withApi(account, async (api) => {
    const res = await api.patch("/api/v1/settings", { data: fields });
    if (!res.ok()) throw new Error(`e2e api: PATCH /settings ${res.status()}`);
  });
}
