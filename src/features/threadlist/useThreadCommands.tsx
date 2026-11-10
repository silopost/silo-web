import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useState, type ReactNode } from "react";
import { useModifyThreads, type ThreadAction } from "../../api/mutations/threads";
import { t } from "../../lib/i18n";

type RunOptions = {
  /** Runs right after the action starts (e.g. go to the next thread). */
  after?: () => void;
  /** Runs on "Cofnij" (e.g. go back to the thread). */
  onUndo?: () => void;
  add?: string[];
  remove?: string[];
  /** No snackbar. */
  silent?: boolean;
};

/** Thread actions of a view; permanent delete asks first (plan 6.5, no undo). */
export function useThreadCommands(accountId: string): {
  run: (action: ThreadAction, ids: string[], opts?: RunOptions) => void;
  dialog: ReactNode;
} {
  const modify = useModifyThreads();
  const [confirm, setConfirm] = useState<{ ids: string[]; after?: () => void } | null>(null);

  const run = useCallback(
    (action: ThreadAction, ids: string[], opts: RunOptions = {}) => {
      if (ids.length === 0) return;
      if (action === "deleteForever") {
        setConfirm({ ids, after: opts.after });
        return;
      }
      void modify({
        accountId,
        ids,
        action,
        add: opts.add,
        remove: opts.remove,
        silent: opts.silent,
        onUndo: opts.onUndo,
      });
      opts.after?.();
    },
    [accountId, modify],
  );

  const dialog = (
    <Dialog.Root open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          role="alertdialog"
          className="fixed top-1/2 left-1/2 z-50 w-[min(28rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-raised p-6 shadow-xl"
        >
          <Dialog.Title className="text-lg">{t.deleteForeverTitle}</Dialog.Title>
          <Dialog.Description className="mt-2 text-ink-muted">
            {t.deleteForeverBody(confirm?.ids.length ?? 0)}
          </Dialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded-full px-4 py-2 font-medium text-primary hover:bg-hover">
              {t.cancel}
            </Dialog.Close>
            <button
              type="button"
              className="rounded-full bg-primary px-4 py-2 font-medium text-on-primary"
              onClick={() => {
                if (confirm) {
                  void modify({ accountId, ids: confirm.ids, action: "deleteForever" });
                  confirm.after?.();
                }
                setConfirm(null);
              }}
            >
              {t.deleteForever}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  return { run, dialog };
}
