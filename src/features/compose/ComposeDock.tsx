import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { useUi } from "../../state/ui";

/** Placeholder of the compose dock; the editor, drafts and sending come in the next slice. */
export function ComposeDock() {
  const open = useUi((s) => s.composeOpen);
  const setOpen = useUi((s) => s.setComposeOpen);
  if (!open) return null;
  return (
    <div className="fixed right-6 bottom-0 z-30 w-[min(32rem,90vw)]">
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="compose-title"
        className="rounded-t-xl bg-panel shadow-2xl"
      >
        <header className="flex items-center justify-between rounded-t-xl bg-surface py-1 pr-1 pl-4">
          <h2 id="compose-title" className="font-medium">
            {t.composePlaceholderTitle}
          </h2>
          <IconButton icon="close" label={t.close} onClick={() => setOpen(false)} />
        </header>
        <p className="p-4 text-ink-muted">{t.composePlaceholderBody}</p>
      </section>
    </div>
  );
}
