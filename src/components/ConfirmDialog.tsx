import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { t } from "../lib/i18n";

type Props = {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

/** A yes/no question (role alertdialog) for actions without undo (plan 6.5, 6.7). */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          role="alertdialog"
          className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-panel p-6 shadow-xl"
        >
          <Dialog.Title className="text-lg">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-ink-muted">{body}</Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover">
              {t.cancel}
            </Dialog.Close>
            <button
              type="button"
              disabled={busy}
              className="rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-60"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
