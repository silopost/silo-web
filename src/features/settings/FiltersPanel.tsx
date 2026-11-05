import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys } from "../../api/keys";
import { deleteFilter, filterBody, replaceFilter, useFilters } from "../../api/queries/filters";
import { useLabels } from "../../api/queries/labels";
import type { Filter, FilterBody, Label } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { useActiveAccount } from "../account";
import { FilterEditor } from "./FilterEditor";

/** The actions of a filter in a few words ("archiwizuj, etykieta Praca"). */
function actionSummary(f: Filter, labels: Label[]): string {
  const s = t.filtersPanel.summary;
  const a = f.actions;
  return [
    a.archive && s.archive,
    a.markRead && s.markRead,
    a.star && s.star,
    a.important && s.important,
    a.trash && s.trash,
    ...(a.addLabelIds ?? []).map((id) => s.label(labels.find((l) => l.id === id)?.name ?? id)),
    a.forwardTo && s.forward(a.forwardTo),
  ]
    .filter(Boolean)
    .join(", ");
}

type Props = {
  /** ?criteria= of the route: open the editor of a new filter with this text. */
  initialCriteria?: string;
  onInitialHandled?: () => void;
};

/**
 * FiltersPanel (plan 6.3, 3.11): the account's filters in `position` order; enabling and moving
 * are a PUT of the whole filter (the server shifts the others), removal asks first.
 */
export function FiltersPanel({ initialCriteria, onInitialHandled }: Props) {
  const qc = useQueryClient();
  const accountId = useActiveAccount()?.id ?? "";
  const { filters, isPending } = useFilters(accountId);
  const labels = useLabels(accountId);
  const [editor, setEditor] = useState<{ filter: Filter | null; criteria?: string } | null>(
    initialCriteria !== undefined ? { filter: null, criteria: initialCriteria } : null,
  );
  const [removing, setRemoving] = useState<Filter | null>(null);

  // New criteria in the URL (also while the panel is open) open the editor once; the URL is
  // then cleaned so that a reload does not open it again.
  const [seenCriteria, setSeenCriteria] = useState(initialCriteria);
  if (initialCriteria !== seenCriteria) {
    setSeenCriteria(initialCriteria);
    if (initialCriteria !== undefined) setEditor({ filter: null, criteria: initialCriteria });
  }
  useEffect(() => {
    if (initialCriteria !== undefined) onInitialHandled?.();
  }, [initialCriteria, onInitialHandled]);

  const refresh = () => void qc.invalidateQueries({ queryKey: keys.filters(accountId) });
  const put = useMutation({
    mutationFn: ({ f, patch }: { f: Filter; patch: Partial<FilterBody> }) =>
      replaceFilter(f.id, filterBody(f, patch)),
    onError: () => toast(t.genericError),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFilter(id),
    onSuccess: () => setRemoving(null),
    onError: () => toast(t.genericError),
    onSettled: refresh,
  });

  return (
    <div className="max-w-5xl">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg">{t.filtersPanel.title}</h2>
        <button
          type="button"
          onClick={() => setEditor({ filter: null })}
          className="rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover"
        >
          {t.filtersPanel.create}
        </button>
      </div>
      {!isPending && filters.length === 0 && (
        <p className="py-4 text-ink-muted">{t.filtersPanel.empty}</p>
      )}
      <ul aria-label={t.filtersPanel.title}>
        {filters.map((f, i) => {
          const title = f.name || f.criteria;
          return (
            <li
              key={f.id}
              aria-label={title}
              className="flex items-center gap-3 border-b border-line py-2"
            >
              <input
                type="checkbox"
                aria-label={t.filtersPanel.enabled(title)}
                checked={f.enabled}
                onChange={(e) => put.mutate({ f, patch: { enabled: e.target.checked } })}
                className="size-4 accent-primary"
              />
              <div className="min-w-0 flex-1">
                {f.name && <div className="font-medium">{f.name}</div>}
                <div className="truncate font-mono text-sm">{f.criteria}</div>
                <div className="text-sm text-ink-muted">{actionSummary(f, labels)}</div>
              </div>
              <IconButton
                icon="arrowUpward"
                label={t.filtersPanel.moveUp(title)}
                disabled={i === 0}
                onClick={() => put.mutate({ f, patch: { position: f.position - 1 } })}
              />
              <IconButton
                icon="arrowDownward"
                label={t.filtersPanel.moveDown(title)}
                disabled={i === filters.length - 1}
                onClick={() => put.mutate({ f, patch: { position: f.position + 1 } })}
              />
              <IconButton
                icon="edit"
                label={t.filtersPanel.edit(title)}
                onClick={() => setEditor({ filter: f })}
              />
              <IconButton
                icon="delete"
                label={t.filtersPanel.remove(title)}
                onClick={() => setRemoving(f)}
              />
            </li>
          );
        })}
      </ul>
      {editor && accountId && (
        <FilterEditor
          key={editor.filter?.id ?? "new"}
          accountId={accountId}
          filter={editor.filter}
          initialCriteria={editor.criteria}
          onClose={() => setEditor(null)}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t.filtersPanel.removeTitle(removing ? removing.name || removing.criteria : "")}
        body={t.filtersPanel.removeBody}
        confirmLabel={t.trash}
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
