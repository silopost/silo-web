import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { call, isApiError } from "../../api/errors";
import { keys } from "../../api/keys";
import { useLabels } from "../../api/queries/labels";
import { syncStatusQuery } from "../../api/queries/syncStatus";
import type { Label } from "../../api/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { DEFAULT_LABEL_BG, DEFAULT_LABEL_TEXT, LABEL_COLORS } from "../../lib/labelColors";
import { toast } from "../../state/toasts";
import { useActiveAccount } from "../account";
import { KeywordWarning } from "../labels/KeywordWarning";
import { keywordWarning, useFolderNames } from "../labels/keywords";

type Kind = "user" | "folder";
type Color = { bg: string; text: string } | null;
type Editing = { kind: Kind; label: Label | null };

/** Labels of one kind as a tree (parentId), depth-first, siblings by name. */
function labelTree(labels: Label[]): { label: Label; depth: number }[] {
  const ids = new Set(labels.map((l) => l.id));
  const children = new Map<string | null, Label[]>();
  for (const l of labels) {
    const parent = l.parentId && ids.has(l.parentId) ? l.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), l]);
  }
  const out: { label: Label; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    const list = [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const l of list) {
      out.push({ label: l, depth });
      walk(l.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * LabelsPanel (plan 6.3, 3.7): user labels as a tree with colours and visibility in LeftNav, the
 * server's folders, and the keyword warnings. Every change is one request; the server answers
 * with label.changed for the other tabs.
 */
export function LabelsPanel() {
  const account = useActiveAccount();
  const accountId = account?.id ?? "";
  const qc = useQueryClient();
  const labels = useLabels(accountId);
  const status = useQuery({ ...syncStatusQuery(accountId), enabled: !!accountId }).data;
  const folderNames = useFolderNames(accountId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<Label | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) =>
      call(api.PATCH("/labels/{id}", { params: { path: { id } }, body })),
    onSettled: refresh,
    onError: () => toast(t.genericError),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE("/labels/{id}", { params: { path: { id }, query: { accountId } } })),
    onError: (err) => toast(isApiError(err, 409) ? t.labelsPanel.folderNotEmpty : t.genericError),
    onSettled: () => {
      setRemoving(null);
      refresh();
    },
  });

  const user = labelTree(labels.filter((l) => l.type === "user"));
  const folders = labelTree(labels.filter((l) => l.type === "folder"));

  const row = ({ label: l, depth }: { label: Label; depth: number }) => {
    const warning = keywordWarning(l, folderNames);
    return (
      <li
        key={l.id}
        aria-label={l.name}
        className="flex items-center gap-3 border-b border-line py-2"
        style={{ paddingLeft: `${depth * 1.5}rem` }}
      >
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-sm border border-line"
          style={{ backgroundColor: l.colorBg ?? "transparent" }}
        />
        <span className="min-w-0 flex-1 truncate">{l.name}</span>
        <KeywordWarning text={warning} />
        <span className="w-48 shrink-0 text-sm text-ink-muted">
          {t.labelsPanel.counts(l.threadsTotal, l.threadsUnread)}
        </span>
        {l.type === "user" && (
          <select
            aria-label={`${t.labelsPanel.showInList}: ${l.name}`}
            value={l.showInList}
            onChange={(e) => patch.mutate({ id: l.id, body: { showInList: e.target.value } })}
            className="rounded border border-line px-1 py-0.5 text-sm"
          >
            {(["show", "hide", "show_if_unread"] as const).map((v) => (
              <option key={v} value={v}>
                {t.labelsPanel.show[v]}
              </option>
            ))}
          </select>
        )}
        {l.type === "user" && (
          <IconButton
            icon="edit"
            label={t.labelsPanel.edit(l.name)}
            onClick={() => setEditing({ kind: "user", label: l })}
          />
        )}
        <IconButton
          icon="delete"
          label={t.labelsPanel.remove(l.name)}
          onClick={() => setRemoving(l)}
        />
      </li>
    );
  };

  return (
    <div className="max-w-4xl">
      {status?.keywordsSupported === false && (
        <p
          role="note"
          className="mb-4 flex items-start gap-2 rounded bg-warn-bg px-3 py-2 text-warn-ink"
        >
          <Icon name="warning" size={20} className="shrink-0" />
          {t.labelsPanel.keywordsUnsupported}
        </p>
      )}
      <section aria-labelledby="labels-user" className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="labels-user" className="text-lg">
            {t.labelsPanel.userLabels}
          </h2>
          <button
            type="button"
            onClick={() => setEditing({ kind: "user", label: null })}
            className="rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover"
          >
            {t.labelsPanel.newLabel}
          </button>
        </div>
        <ul>{user.map(row)}</ul>
      </section>
      <section aria-labelledby="labels-folders">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="labels-folders" className="text-lg">
            {t.labelsPanel.folders}
          </h2>
          <button
            type="button"
            onClick={() => setEditing({ kind: "folder", label: null })}
            className="rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover"
          >
            {t.labelsPanel.newFolder}
          </button>
        </div>
        <ul>{folders.map(row)}</ul>
      </section>
      {editing && (
        <LabelDialog
          accountId={accountId}
          editing={editing}
          parents={(editing.kind === "user" ? user : folders).map((x) => x.label)}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={
          removing?.type === "folder"
            ? t.labelsPanel.removeFolderTitle(removing.name)
            : t.labelsPanel.removeLabelTitle(removing?.name ?? "")
        }
        body={
          removing?.type === "folder"
            ? t.labelsPanel.removeFolderBody
            : t.labelsPanel.removeLabelBody
        }
        confirmLabel={t.trash}
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: Color; onChange: (c: Color) => void }) {
  return (
    <div role="radiogroup" aria-label={t.labelsPanel.color} className="flex flex-wrap gap-1">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label={t.labelsPanel.noColor}
        onClick={() => onChange(null)}
        className="size-7 rounded border border-line aria-checked:outline-2 aria-checked:outline-primary"
        style={{ backgroundColor: DEFAULT_LABEL_BG, color: DEFAULT_LABEL_TEXT }}
      >
        –
      </button>
      {LABEL_COLORS.map((c) => (
        <button
          key={c.bg}
          type="button"
          role="radio"
          aria-checked={value?.bg === c.bg}
          aria-label={c.bg}
          onClick={() => onChange(c)}
          className="size-7 rounded border border-line text-xs aria-checked:outline-2 aria-checked:outline-primary"
          style={{ backgroundColor: c.bg, color: c.text }}
        >
          a
        </button>
      ))}
    </div>
  );
}

function LabelDialog({
  accountId,
  editing,
  parents,
  onClose,
}: {
  accountId: string;
  editing: Editing;
  parents: Label[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const l = editing.label;
  const [name, setName] = useState(l?.name ?? "");
  const [color, setColor] = useState<Color>(
    l?.colorBg ? { bg: l.colorBg, text: l.colorText ?? DEFAULT_LABEL_TEXT } : null,
  );
  const [parentId, setParentId] = useState(l?.parentId ?? "");
  const save = useMutation({
    mutationFn: () =>
      l
        ? call(
            api.PATCH("/labels/{id}", {
              params: { path: { id: l.id } },
              body: {
                ...(name.trim() !== l.name ? { name: name.trim() } : {}),
                // An empty string clears the colour.
                colorBg: color?.bg ?? "",
                colorText: color?.text ?? "",
              },
            }),
          )
        : call(
            api.POST("/labels", {
              body: {
                accountId,
                name: name.trim(),
                type: editing.kind,
                ...(color && editing.kind === "user"
                  ? { colorBg: color.bg, colorText: color.text }
                  : {}),
                ...(parentId ? { parentId } : {}),
              },
            }),
          ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
      onClose();
    },
    onError: () => toast(t.genericError),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) save.mutate();
  };
  const title = l
    ? t.labelsPanel.edit(l.name)
    : editing.kind === "user"
      ? t.labelsPanel.newLabel
      : t.labelsPanel.newFolder;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-panel p-6 shadow-xl">
          <Dialog.Title className="mb-4 text-lg">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-ink-muted">{t.labelsPanel.name}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-line px-2 py-1"
              />
            </label>
            {editing.kind === "user" && (
              <div className="flex flex-col gap-1">
                <span className="text-sm text-ink-muted">{t.labelsPanel.color}</span>
                <ColorPicker value={color} onChange={setColor} />
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-sm text-ink-muted">{t.labelsPanel.parent}</span>
              <select
                value={parentId}
                disabled={!!l}
                title={l ? t.labelsPanel.parentReadOnly : undefined}
                onChange={(e) => setParentId(e.target.value)}
                className="rounded border border-line px-2 py-1"
              >
                <option value="">{t.labelsPanel.noParent}</option>
                {parents
                  .filter((p) => p.id !== l?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Dialog.Close className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover">
                {t.cancel}
              </Dialog.Close>
              <button
                type="submit"
                disabled={!name.trim() || save.isPending}
                className="rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                {l ? t.labelsPanel.save : t.labelsPanel.create}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
