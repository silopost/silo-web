import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";
import { call } from "../errors";

/** GET /meta: server version and limits (maxAttachmentBytes); fixed while the page lives. */
export const metaQuery = queryOptions({
  queryKey: ["meta"] as const,
  queryFn: ({ signal }) => call(api.GET("/meta", { signal })),
  staleTime: Infinity,
  retry: false,
});
