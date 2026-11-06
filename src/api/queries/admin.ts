import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";
import { call } from "../errors";

export type JobStatus = "dead" | "pending";

/** Keys of the admin panel (plan 5.1 /admin/*); all under ['admin']. */
export const adminKeys = {
  all: ["admin"] as const,
  users: ["admin", "users"] as const,
  accounts: ["admin", "accounts"] as const,
  jobs: (status: JobStatus, accountId?: string) =>
    ["admin", "jobs", status, accountId ?? null] as const,
};

export const adminUsersQuery = queryOptions({
  queryKey: adminKeys.users,
  queryFn: async ({ signal }) => (await call(api.GET("/admin/users", { signal }))).users ?? [],
  retry: false,
});

export const adminAccountsQuery = queryOptions({
  queryKey: adminKeys.accounts,
  queryFn: async ({ signal }) =>
    (await call(api.GET("/admin/accounts", { signal }))).accounts ?? [],
  retry: false,
});

/** Jobs refresh every 30 s while the tab is visible (TanStack pauses intervals in background). */
export const adminJobsQuery = (status: JobStatus, accountId?: string) =>
  queryOptions({
    queryKey: adminKeys.jobs(status, accountId),
    queryFn: async ({ signal }) =>
      (
        await call(
          api.GET("/admin/jobs", {
            params: { query: accountId ? { status, accountId } : { status } },
            signal,
          }),
        )
      ).jobs ?? [],
    refetchInterval: 30_000,
    retry: false,
  });
