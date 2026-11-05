import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { api } from "../client";
import { call, isApiError } from "../errors";
import { keys } from "../keys";
import type { Session, Settings, SettingsPatch } from "../types";
import { sessionQuery } from "./session";

/** GET /settings; the session carries the same object, used until the first answer. */
export const settingsQuery = queryOptions({
  queryKey: keys.settings,
  queryFn: ({ signal }) => call(api.GET("/settings", { signal })),
  staleTime: Infinity,
});

export function useSettings(): Settings | undefined {
  const qc = useQueryClient();
  return useQuery({
    ...settingsQuery,
    initialData: () => qc.getQueryData<Session>(sessionQuery.queryKey)?.settings,
    // The session's copy may be old: fetch once in the background.
    initialDataUpdatedAt: 0,
  }).data;
}

/** The message of a refused setting (422 invalid_setting / invalid_timezone). */
export function settingsErrorMessage(err: unknown): string {
  if (isApiError(err, 422))
    return err.code === "invalid_timezone" ? t.settings.invalidTimezone : t.settings.invalidSetting;
  return t.genericError;
}

/**
 * PATCH /settings with one field at a time (JSON merge on the server). The answer, the whole
 * object, replaces the cache and the session's copy; an error shows a snackbar and refetches.
 */
export function usePatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => call(api.PATCH("/settings", { body: patch })),
    onMutate: (patch) => {
      const prev = qc.getQueryData<Settings>(keys.settings);
      if (prev)
        qc.setQueryData<Settings>(keys.settings, { ...prev, ...(patch as Partial<Settings>) });
      return { prev };
    },
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      qc.setQueryData<Session>(sessionQuery.queryKey, (old) =>
        old ? { ...old, settings: s } : old,
      );
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.settings, ctx.prev);
      toast(settingsErrorMessage(err));
    },
  });
}
