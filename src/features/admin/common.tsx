import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isApiError } from "../../api/errors";
import { t } from "../../lib/i18n";
import { Forbidden } from "./AdminLayout";

const STATE_COLORS: Record<string, string> = {
  live: "bg-[#e6f4ea] text-[#0d652d]",
  initial_sync: "bg-nav-active text-ink",
  connecting: "bg-nav-active text-ink",
  discovering: "bg-nav-active text-ink",
  backoff: "bg-warn-bg text-warn-ink",
  auth_failed: "bg-error-bg text-error-ink",
  disabled: "bg-hover text-ink-muted",
};

/** Sync state of an account as a coloured chip with its Polish name. */
export function StateChip({ state }: { state: string }) {
  return (
    <span
      data-state={state}
      className={`inline-block rounded px-1.5 text-sm whitespace-nowrap ${STATE_COLORS[state] ?? ""}`}
    >
      {t.accountsPanel.states[state] ?? state}
    </span>
  );
}

/** Loading, 403 ("Brak uprawnień") and other errors of an /admin/* query, else the content. */
export function QueryView<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <p className="text-ink-muted">{t.loading}</p>;
  if (query.isError) {
    if (isApiError(query.error, 403)) return <Forbidden />;
    return <p role="alert">{t.genericError}</p>;
  }
  return <>{children(query.data)}</>;
}
