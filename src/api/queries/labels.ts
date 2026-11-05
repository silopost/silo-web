import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "../client";
import { call } from "../errors";
import { keys } from "../keys";
import type { Label } from "../types";

export const labelsQuery = (accountId: string) =>
  queryOptions({
    queryKey: keys.labels(accountId),
    queryFn: ({ signal }) => call(api.GET("/labels", { params: { query: { accountId } }, signal })),
    staleTime: 30_000,
  });

const empty: Label[] = [];

export function useLabels(accountId: string | undefined): Label[] {
  return useQuery({ ...labelsQuery(accountId ?? ""), enabled: !!accountId }).data?.labels ?? empty;
}
