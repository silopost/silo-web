import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "../client";
import { call } from "../errors";
import { keys } from "../keys";
import type { Filter, FilterBody } from "../types";

export const filtersQuery = (accountId: string) =>
  queryOptions({
    queryKey: keys.filters(accountId),
    queryFn: ({ signal }) =>
      call(api.GET("/filters", { params: { query: { accountId } }, signal })),
    staleTime: 30_000,
  });

const empty: Filter[] = [];

export function useFilters(accountId: string | undefined) {
  const q = useQuery({ ...filtersQuery(accountId ?? ""), enabled: !!accountId });
  return { ...q, filters: q.data?.filters ?? empty };
}

/** The whole filter as PUT /filters/{id} wants it (a full replacement, plan 5.1). */
export const filterBody = (f: Filter, patch: Partial<FilterBody> = {}): FilterBody => ({
  accountId: f.accountId,
  name: f.name,
  criteria: f.criteria,
  enabled: f.enabled,
  position: f.position,
  actions: {
    archive: f.actions.archive,
    markRead: f.actions.markRead,
    star: f.actions.star,
    important: f.actions.important,
    trash: f.actions.trash,
    addLabelIds: f.actions.addLabelIds ?? [],
    ...(f.actions.forwardTo ? { forwardTo: f.actions.forwardTo } : {}),
  },
  ...patch,
});

export const createFilter = (body: FilterBody): Promise<Filter> =>
  call(api.POST("/filters", { body }));

export const replaceFilter = (id: string, body: FilterBody): Promise<Filter> =>
  call(api.PUT("/filters/{id}", { params: { path: { id } }, body }));

export const deleteFilter = (id: string): Promise<unknown> =>
  call(api.DELETE("/filters/{id}", { params: { path: { id } } }));

/** Filters applied from this tab: filter.applied of one of them shows the result. */
export const appliedHere = new Set<string>();

export const applyFilter = async (id: string) => {
  const res = await call(api.POST("/filters/{id}/apply", { params: { path: { id } } }));
  appliedHere.add(id);
  return res;
};
