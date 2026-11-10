import * as Dialog from "@radix-ui/react-dialog";
import { IconButton } from "../components/IconButton";
import { t } from "../lib/i18n";
import { useUi } from "../state/ui";
import { KEYMAP, shortcutLabel } from "./keymap";

const keyLabel = (k: string) =>
  k === "Escape" ? "Esc" : k === "I" || k === "U" ? `Shift+${k}` : k;

/** The `?` dialog, generated from keymap.ts (plan 6.6). */
export function ShortcutsHelpDialog() {
  const open = useUi((s) => s.shortcutsHelpOpen);
  const setOpen = useUi((s) => s.setShortcutsHelpOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        {/* Focus the dialog itself, not its close button: the button's tooltip would open and take
            the first Esc (a Radix layer above the dialog), so Esc did not close the dialog. */}
        <Dialog.Content
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-[min(40rem,90vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-raised p-6 shadow-xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg">{t.shortcuts}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton icon="close" label={t.close} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t.shortcuts}</Dialog.Description>
          <table className="w-full text-left">
            <tbody>
              {KEYMAP.map((s) => (
                <tr key={s.keys.join(" ")} className="border-t border-line">
                  <td className="py-1 pr-4 whitespace-nowrap">
                    {s.keys.map((k, i) => (
                      <kbd key={i} className="mr-1 rounded border border-line bg-surface px-1.5">
                        {keyLabel(k)}
                      </kbd>
                    ))}
                  </td>
                  <td className="py-1">{shortcutLabel(s)}</td>
                  <td className="py-1 text-ink-muted">{t.shortcutScopes[s.scope]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
