import * as Dialog from "@radix-ui/react-dialog";
import type { FormEvent, ReactNode } from "react";
import { t } from "../lib/i18n";

type Props = {
  title: string;
  description?: ReactNode;
  submitLabel: string;
  busy?: boolean;
  /** Disables the submit button (e.g. a confirmation not typed yet). */
  disabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A modal form (Radix Dialog: focus trap, Esc, focus back to the trigger, plan 6.7) with
 * "Anuluj" and a submit button.
 */
export function FormDialog({
  title,
  description,
  submitLabel,
  busy,
  disabled,
  onSubmit,
  onClose,
  children,
}: Props) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-panel p-6 shadow-xl">
          <Dialog.Title className="text-lg">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-2 text-ink-muted">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            {children}
            <div className="mt-2 flex justify-end gap-2">
              <Dialog.Close
                type="button"
                className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover"
              >
                {t.cancel}
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy || disabled}
                className="rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                {submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
