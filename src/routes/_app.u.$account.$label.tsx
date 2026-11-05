import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useLabels } from "../api/queries/labels";
import { useActiveAccount } from "../features/account";
import { ThreadList } from "../features/threadlist/ThreadList";
import { useLabelListContext } from "../features/threadlist/routeContext";
import { t } from "../lib/i18n";
import { resolveLabelSlug, viewName } from "../lib/labels";

export const Route = createFileRoute("/_app/u/$account/$label")({
  component: LabelView,
});

/** /u/<n>/<label>: the list of a label, or the open thread (child route) in its place. */
function LabelView() {
  const { account, label } = Route.useParams();
  const { threadId } = useParams({ strict: false }) as { threadId?: string };
  const active = useActiveAccount();
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

  if (!active) return <p className="p-6">{t.noAccount}</p>;
  if (resolved.kind === "unknown") return <p className="p-6">{t.unknownLabel}</p>;
  if (threadId) return <Outlet />;
  return <ThreadList key={`${account}/${label}`} ctx={ctx} />;
}
