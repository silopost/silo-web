import { createFileRoute } from "@tanstack/react-router";
import { useLabels } from "../api/queries/labels";
import { useActiveAccount } from "../features/account";
import { ThreadView } from "../features/thread/ThreadView";
import { useLabelListContext } from "../features/threadlist/routeContext";
import { resolveLabelSlug, viewName } from "../lib/labels";

export const Route = createFileRoute("/_app/u/$account/$label/$threadId")({
  component: LabelThread,
});

function LabelThread() {
  const { account, label, threadId } = Route.useParams();
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
  return <ThreadView key={threadId} ctx={ctx} threadId={threadId} />;
}
