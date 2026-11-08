import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useLabels } from "../../api/queries/labels";
import { Icon, type IconName } from "../../components/Icon";
import { intlLocale, t } from "../../lib/i18n";
import { SYSTEM_VIEWS } from "../../lib/labels";
import { useUi } from "../../state/ui";
import { useAccountIndex, useActiveAccount } from "../account";

type Entry = { slug: string; name: string; icon: IconName };

/** The `g l` picker (plan 6.6): system views, labels and folders; Enter goes to the first match. */
export function GoToLabelDialog() {
  const open = useUi((s) => s.labelPickerOpen);
  const setOpen = useUi((s) => s.setLabelPickerOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="fixed top-24 left-1/2 z-50 w-[min(24rem,90vw)] -translate-x-1/2 rounded-2xl bg-panel p-4 shadow-xl">
          <Dialog.Title className="mb-2 text-lg">{t.goToLabel}</Dialog.Title>
          <Dialog.Description className="sr-only">{t.goToLabel}</Dialog.Description>
          {open && <Picker onDone={() => setOpen(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Picker({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const account = useAccountIndex();
  const labels = useLabels(useActiveAccount()?.id);
  const [q, setQ] = useState("");

  const entries: Entry[] = [
    ...SYSTEM_VIEWS.map((v) => ({ slug: v.slug, name: v.name, icon: v.icon })),
    ...labels
      .filter((l) => l.type === "user" || l.type === "folder")
      .map((l) => ({
        slug: l.id,
        name: l.name,
        icon: (l.type === "folder" ? "folder" : "label") as IconName,
      })),
  ];
  const needle = q.trim().toLocaleLowerCase(intlLocale());
  const shown = needle
    ? entries.filter((e) => e.name.toLocaleLowerCase(intlLocale()).includes(needle))
    : entries;

  const go = (slug: string) => {
    onDone();
    void navigate({ to: "/u/$account/$label", params: { account, label: slug } });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (shown[0]) go(shown[0].slug);
  };

  return (
    <form onSubmit={submit}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={t.filterLabels}
        placeholder={t.filterLabels}
        className="mb-2 w-full rounded border border-line px-2 py-1"
      />
      {shown.length === 0 ? (
        <p className="px-2 py-1 text-ink-muted">{t.noLabels}</p>
      ) : (
        <ul aria-label={t.goToLabel} className="max-h-72 overflow-auto">
          {shown.map((e) => (
            <li key={e.slug}>
              <button
                type="button"
                onClick={() => go(e.slug)}
                className="flex w-full items-center gap-3 rounded px-2 py-1 text-left hover:bg-hover focus:bg-hover"
              >
                <Icon name={e.icon} size={18} />
                <span className="truncate">{e.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
