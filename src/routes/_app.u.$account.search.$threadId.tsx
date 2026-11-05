import { createFileRoute } from "@tanstack/react-router";
import { useActiveAccount } from "../features/account";
import { ThreadView } from "../features/thread/ThreadView";
import { useSearchListContext } from "../features/threadlist/routeContext";
import { t } from "../lib/i18n";

export const Route = createFileRoute("/_app/u/$account/search/$threadId")({
  component: SearchThread,
});

function SearchThread() {
  const { account, threadId } = Route.useParams();
  const { q } = Route.useSearch();
  const active = useActiveAccount();
  const ctx = useSearchListContext(account, active?.id ?? "", q, t.searchResults(q));
  return <ThreadView key={threadId} ctx={ctx} threadId={threadId} />;
}
