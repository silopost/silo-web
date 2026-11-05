import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import type { ListFilter } from "../../api/keys";
import { openDraftOfThread } from "../compose/actions";
import type { ListContext } from "./listContext";

/** List context of a label view: /u/<n>/<label>[/<threadId>]. */
export function useLabelListContext(
  account: string,
  label: string,
  accountId: string,
  filter: ListFilter,
  title: string,
): ListContext {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const labelId = filter.labelId;
  return useMemo(() => {
    const showThread = (threadId: string) =>
      void navigate({
        to: "/u/$account/$label/$threadId",
        params: { account, label, threadId },
      });
    return {
      accountId,
      filter: { labelId },
      title,
      // In Drafts a row opens its draft in a compose window (Gmail); a thread without one opens.
      openThread:
        labelId === "DRAFT"
          ? (threadId: string) =>
              void openDraftOfThread(qc, threadId).then((opened) => opened || showThread(threadId))
          : showThread,
      backToList: () => void navigate({ to: "/u/$account/$label", params: { account, label } }),
    };
  }, [navigate, qc, account, label, accountId, labelId, title]);
}

/** List context of a search: /u/<n>/search[/<threadId>]?q=. */
export function useSearchListContext(
  account: string,
  accountId: string,
  q: string,
  title: string,
): ListContext {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      accountId,
      filter: { q },
      title,
      openThread: (threadId: string) =>
        void navigate({
          to: "/u/$account/search/$threadId",
          params: { account, threadId },
          search: { q },
        }),
      backToList: () =>
        void navigate({ to: "/u/$account/search", params: { account }, search: { q } }),
    }),
    [navigate, account, accountId, q, title],
  );
}
