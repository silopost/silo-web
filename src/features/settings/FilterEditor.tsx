import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { useLabels } from "../../api/queries/labels";
import { applyFilter, createFilter, filterBody, replaceFilter } from "../../api/queries/filters";
import type { Filter, FilterBody } from "../../api/types";
import { t } from "../../lib/i18n";
import { buildQuery, emptyAdvanced, type AdvancedFields } from "../../lib/searchText";
import { toast } from "../../state/toasts";
import { useAccountIndex } from "../account";
import { AdvancedFieldsForm } from "../search/AdvancedFields";

const FLAGS = ["archive", "markRead", "star", "important", "trash"] as const;
type Flag = (typeof FLAGS)[number];

type Props = {
  accountId: string;
  /** The filter to edit; null = a new one. */
  filter: Filter | null;
  /** Criteria text of a new filter ("Utwórz filtr" of the search). */
  initialCriteria?: string;
  onClose: () => void;
};

/**
 * FilterEditor (plan 6.3, 3.11, 2.6): the fields of the advanced search, or the raw text, put
 * together into `criteria` exactly as the search box does; the server validates the syntax
 * (422 invalid_query, shown at the field), matches and applies. Nothing is parsed here.
 */
export function FilterEditor({ accountId, filter, initialCriteria, onClose }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const account = useAccountIndex();
  const userLabels = useLabels(accountId).filter((l) => l.type === "user");
  const startText = filter?.criteria ?? initialCriteria ?? "";
  const [name, setName] = useState(filter?.name ?? "");
  // A criteria text cannot be split back into fields (no parser): it is edited as text.
  const [asText, setAsText] = useState(startText !== "");
  const [fields, setFields] = useState<AdvancedFields>(emptyAdvanced);
  const [text, setText] = useState(startText);
  const [flags, setFlags] = useState<Record<Flag, boolean>>(() => ({
    archive: filter?.actions.archive ?? false,
    markRead: filter?.actions.markRead ?? false,
    star: filter?.actions.star ?? false,
    important: filter?.actions.important ?? false,
    trash: filter?.actions.trash ?? false,
  }));
  const [labelIds, setLabelIds] = useState<string[]>(filter?.actions.addLabelIds ?? []);
  const [forwardTo, setForwardTo] = useState(filter?.actions.forwardTo ?? "");
  const [applyExisting, setApplyExisting] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const criteria = asText ? text.trim() : buildQuery(fields);

  const toggleMode = () => {
    if (asText) setFields({ ...emptyAdvanced, hasWords: text.trim() });
    else setText(buildQuery(fields));
    setAsText(!asText);
  };

  const testCriteria = () => {
    if (!criteria) return;
    onClose();
    void navigate({ to: "/u/$account/search", params: { account }, search: { q: criteria } });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setCriteriaError(null);
    setFormError(null);
    if (!criteria) {
      setCriteriaError(t.filtersPanel.noCriteria);
      return;
    }
    const actions: FilterBody["actions"] = {
      ...flags,
      addLabelIds: labelIds,
      ...(forwardTo.trim() ? { forwardTo: forwardTo.trim() } : {}),
    };
    const body: FilterBody = filter
      ? filterBody(filter, { name: name.trim(), criteria, actions })
      : { accountId, name: name.trim(), criteria, actions, enabled: true };
    setSaving(true);
    try {
      const saved = filter ? await replaceFilter(filter.id, body) : await createFilter(body);
      void qc.invalidateQueries({ queryKey: keys.filters(accountId) });
      if (applyExisting) {
        const res = await applyFilter(saved.id);
        toast(t.filtersPanel.applying(res.matchedEstimate));
      } else toast(t.settings.saved);
      onClose();
    } catch (err) {
      if (isApiError(err, 422) && err.code === "invalid_query") {
        setCriteriaError(t.filtersPanel.invalidQuery);
      } else if (isApiError(err, 422) && err.code === "invalid_label") {
        setFormError(t.filtersPanel.invalidLabel);
      } else if (isApiError(err, 422)) {
        setFormError(t.filtersPanel.invalidFilter);
      } else setFormError(t.genericError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[min(42rem,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-panel p-6 shadow-xl">
          <Dialog.Title className="mb-4 text-lg">
            {filter ? t.filtersPanel.edit(filter.name || filter.criteria) : t.filtersPanel.create}
          </Dialog.Title>
          <Dialog.Description className="sr-only">{t.filtersPanel.editorTitle}</Dialog.Description>
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
            <label className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm text-ink-muted">{t.filtersPanel.name}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 flex-1 border-b border-line bg-transparent px-1 py-1 outline-none"
              />
            </label>
            <fieldset className="flex flex-col gap-3 rounded border border-line p-3">
              <legend className="px-1 text-sm font-medium">{t.filtersPanel.criteria}</legend>
              {asText ? (
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-ink-muted">{t.filtersPanel.criteriaText}</span>
                  <textarea
                    value={text}
                    rows={3}
                    aria-invalid={criteriaError !== null}
                    aria-describedby={criteriaError ? "filter-criteria-error" : undefined}
                    onChange={(e) => setText(e.target.value)}
                    className="rounded border border-line px-2 py-1 font-mono text-sm"
                  />
                </label>
              ) : (
                <AdvancedFieldsForm accountId={accountId} value={fields} onChange={setFields} />
              )}
              {criteriaError && (
                <p id="filter-criteria-error" role="alert" className="text-sm text-error-ink">
                  {criteriaError}
                </p>
              )}
              {!asText && criteria && (
                <p
                  className="font-mono text-sm text-ink-muted"
                  aria-label={t.filtersPanel.criteria}
                >
                  {criteria}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={toggleMode}
                  className="rounded-full px-3 py-1 text-sm font-medium text-primary hover:bg-hover"
                >
                  {asText ? t.filtersPanel.editAsFields : t.filtersPanel.editAsText}
                </button>
                <button
                  type="button"
                  disabled={!criteria}
                  onClick={testCriteria}
                  className="rounded-full px-3 py-1 text-sm font-medium text-primary hover:bg-hover disabled:opacity-50"
                >
                  {t.filtersPanel.test}
                </button>
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2 rounded border border-line p-3">
              <legend className="px-1 text-sm font-medium">{t.filtersPanel.actionsTitle}</legend>
              {FLAGS.map((flag) => (
                <label key={flag} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={flags[flag]}
                    onChange={(e) => setFlags((f) => ({ ...f, [flag]: e.target.checked }))}
                    className="size-4 accent-primary"
                  />
                  {t.filtersPanel.actions[flag]}
                </label>
              ))}
              {userLabels.length > 0 && (
                <div role="group" aria-label={t.filtersPanel.addLabels} className="mt-1">
                  <span className="text-sm text-ink-muted">{t.filtersPanel.addLabels}</span>
                  <div className="flex flex-wrap gap-x-4">
                    {userLabels.map((l) => (
                      <label key={l.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={labelIds.includes(l.id)}
                          onChange={(e) =>
                            setLabelIds((ids) =>
                              e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id),
                            )
                          }
                          className="size-4 accent-primary"
                        />
                        {l.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-ink-muted">
                  {t.filtersPanel.forwardTo}
                </span>
                <input
                  type="email"
                  value={forwardTo}
                  onChange={(e) => setForwardTo(e.target.value)}
                  className="min-w-0 flex-1 border-b border-line bg-transparent px-1 py-1 outline-none"
                />
              </label>
            </fieldset>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={applyExisting}
                onChange={(e) => setApplyExisting(e.target.checked)}
                className="size-4 accent-primary"
              />
              {t.filtersPanel.applyExisting}
            </label>
            {formError && (
              <p role="alert" className="text-sm text-error-ink">
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover">
                {t.cancel}
              </Dialog.Close>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                {t.filtersPanel.save}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
