import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api } from "../client";
import { call } from "../errors";
import { keys } from "../keys";

/** GET /search/suggest: history, contacts, labels and operators, all computed by the server. */
export const searchSuggestQuery = (accountId: string, q: string) =>
  queryOptions({
    queryKey: keys.searchSuggest(accountId, q),
    queryFn: ({ signal }) =>
      call(api.GET("/search/suggest", { params: { query: { accountId, q } }, signal })),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

/** DELETE /search/history: one query (exact text) or, without it, the whole history. */
export const deleteSearchHistory = (accountId: string, query?: string): Promise<unknown> =>
  call(api.DELETE("/search/history", { params: { query: { accountId, query } } }));
