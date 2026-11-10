import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useLabels } from "../api/queries/labels";
import { useAccounts, useActiveAccount } from "../features/account";
import { SplitPane } from "../features/layout/SplitPane";
import { ThreadList } from "../features/threadlist/ThreadList";
import { useLabelListContext } from "../features/threadlist/routeContext";
import { t } from "../lib/i18n";
import { resolveLabelSlug, viewName } from "../lib/labels";

export const Route = createFileRoute("/_app/u/$account/$label")({
  component: LabelView,
});

/**
 * /u/<n>/<label>: the list of a label and the open thread (child route), in its place or beside
 * it (reading pane).
 */
function LabelView() {
  const { account, label } = Route.useParams();
  const { threadId } = useParams({ strict: false }) as { threadId?: string };
  const active = useActiveAccount();
  const hasAccounts = useAccounts().length > 0;
  const labels = useLabels(active?.id);
  const resolved = resolveLabelSlug(label);
  const labelId =
    resolved.kind === "system"
      ? resolved.view.labelId
      : resolved.kind === "label"
        ? resolved.labelId
        : undefined;
  const ctx = useLabelListContext(
    account,
    label,
    active?.id ?? "",
    { labelId },
    viewName(label, labels),
  );

  if (!hasAccounts) return <NoAccounts account={account} />;
  if (!active) return <p className="p-6">{t.noAccount}</p>;
  if (resolved.kind === "unknown") return <p className="p-6">{t.unknownLabel}</p>;
  return (
    <SplitPane
      open={!!threadId}
      onClose={ctx.backToList}
      list={<ThreadList key={`${account}/${label}`} ctx={ctx} />}
      pane={<Outlet />}
    />
  );
}

/** Mode local: a new user has no mail account until they add one. */
function NoAccounts({ account }: { account: string }) {
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h1 className="text-xl">{t.noAccountsYet}</h1>
      <p className="text-ink-muted">{t.noAccountsHint}</p>
      <Link
        to="/u/$account/settings/accounts"
        params={{ account }}
        search={{ add: true }}
        className="rounded-full bg-primary px-4 py-1.5 font-medium text-on-primary"
      >
        {t.switcher.addAccount}
      </Link>
    </div>
  );
}
