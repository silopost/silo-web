import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { call } from "../../api/errors";
import { keys } from "../../api/keys";
import { useLabels } from "../../api/queries/labels";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";

type Props = {
  accountId: string;
  /** Current labels of each target thread. */
  threads: { id: string; labelIds: string[] }[];
  /** Applies a change of user labels to the target threads. */
  onChange: (add: string[], remove: string[]) => void;
};

/** "Etykiety" popover: user labels as checkboxes and creating a new one (POST /labels). */
export function LabelsPopover({ accountId, threads, onChange }: Props) {
  const qc = useQueryClient();
  const labels = useLabels(accountId).filter((l) => l.type === "user");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: (labelName: string) =>
      call(api.POST("/labels", { body: { accountId, name: labelName, type: "user" } })),
    onSuccess: (label) => {
      setName("");
      void qc.invalidateQueries({ queryKey: keys.labels(accountId) });
      onChange([label.id], []);
    },
    onError: () => toast(t.genericError),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton icon="label" label={t.labelAs} disabled={threads.length === 0} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-64 rounded-lg bg-panel p-2 shadow-lg"
          aria-label={t.labelAs}
        >
          <p className="px-2 pb-1 font-medium">{t.labelAs}</p>
          <ul className="max-h-64 overflow-auto">
            {labels.map((l) => {
              const count = threads.filter((th) => th.labelIds.includes(l.id)).length;
              const all = count === threads.length && count > 0;
              return (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-hover">
                    <input
                      type="checkbox"
                      checked={all}
                      ref={(el) => {
                        if (el) el.indeterminate = count > 0 && !all;
                      }}
                      onChange={() => (all ? onChange([], [l.id]) : onChange([l.id], []))}
                      className="size-4 accent-primary"
                    />
                    <span className="truncate">{l.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <form onSubmit={submit} className="mt-2 flex gap-1 border-t border-line pt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.newLabel}
              aria-label={t.newLabel}
              className="min-w-0 flex-1 rounded border border-line px-2 py-1"
            />
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="rounded px-2 font-medium text-primary disabled:opacity-50"
            >
              {t.createLabel}
            </button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
