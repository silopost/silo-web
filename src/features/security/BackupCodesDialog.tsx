import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { t } from "../../lib/i18n";
import { copyText, downloadText } from "./clipboard";

/**
 * The backup codes of POST /totp/enable or /totp/backup-codes, shown only this once: copy,
 * download, and the dialog closes only after "Zapisałem kody".
 */
export function BackupCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");
  return (
    <Dialog.Root open onOpenChange={(o) => !o && saved && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          onEscapeKeyDown={(e) => !saved && e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-panel p-6 shadow-xl"
        >
          <Dialog.Title className="text-lg">{t.security.backupTitle}</Dialog.Title>
          <Dialog.Description className="mt-2 text-ink-muted">
            {t.security.backupHint}
          </Dialog.Description>
          <ul
            aria-label={t.security.backupList}
            className="mt-4 grid grid-cols-2 gap-2 rounded bg-surface p-4 font-mono"
          >
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void copyText(text)}
              className="rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover"
            >
              {t.security.copy}
            </button>
            <button
              type="button"
              onClick={() => downloadText("silo-kody-zapasowe.txt", `${text}\n`)}
              className="rounded-full border border-line px-4 py-1.5 font-medium text-primary hover:bg-hover"
            >
              {t.security.download}
            </button>
          </div>
          <label className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="size-4 accent-primary"
            />
            {t.security.saved}
          </label>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={!saved}
              onClick={onClose}
              className="rounded-full bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {t.security.done}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
