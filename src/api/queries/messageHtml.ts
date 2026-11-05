import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";
import { call, isApiError } from "../errors";
import { keys } from "../keys";

const MAX_RETRIES = 6;

/**
 * Sanitised HTML of a message. The response is immutable, so it never goes stale. A body that is
 * not mirrored yet answers 503 content_not_available with Retry-After (plan 5.1): the query
 * retries after the advised delay and the card shows a spinner meanwhile.
 */
export const messageHtmlQuery = (id: string) =>
  queryOptions({
    queryKey: keys.messageHtml(id),
    queryFn: async ({ signal }) =>
      (await call(
        api.GET("/messages/{id}/html", { params: { path: { id } }, parseAs: "text", signal }),
      )) as string,
    staleTime: Infinity,
    retry: (count, err) => isApiError(err, 503) && count < MAX_RETRIES,
    retryDelay: (_count, err) => ((isApiError(err) ? err.retryAfter : undefined) ?? 2) * 1000,
  });
