import { queryOptions } from "@tanstack/react-query";
import { api } from "../client";
import { call } from "../errors";
import { keys } from "../keys";

/**
 * GET /snooze/presets: Gmail's suggestions computed by the server in the user's time zone
 * (plan 2.6, 3.10); the client only translates the label by key and formats `until`.
 */
export const snoozePresetsQuery = queryOptions({
  queryKey: keys.snoozePresets,
  queryFn: ({ signal }) => call(api.GET("/snooze/presets", { signal })),
  // "Later today" disappears as the day goes on: ask again on every open of a picker.
  staleTime: 0,
});
