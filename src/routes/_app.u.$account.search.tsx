import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useActiveAccount } from "../features/account";
import { ThreadList } from "../features/threadlist/ThreadList";
import { useSearchListContext } from "../features/threadlist/routeContext";
import { t } from "../lib/i18n";

type SearchParams = { q: string };

export const Route = createFileRoute("/_app/u/$account/search")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: SearchView,
});

/** /u/<n>/search?q=: full-text results (plain words, no operators in Faza 3). */
function SearchView() {
  const { account } = Route.useParams();
  const { q } = Route.useSearch();
  const { threadId } = useParams({ strict: false }) as { threadId?: string };
  const active = useActiveAccount();
  const ctx = useSearchListContext(account, active?.id ?? "", q, t.searchResults(q));

  if (!active) return <p className="p-6">{t.noAccount}</p>;
  if (threadId) return <Outlet />;
  return <ThreadList key={`${account}?${q}`} ctx={ctx} />;
}
