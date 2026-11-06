import { useEffect } from "react";
import { t } from "../../lib/i18n";
import { useCompose } from "../../state/compose";
import { ComposeWindow } from "./ComposeWindow";
import { hasUnsavedDrafts } from "./session";

/**
 * Compose windows in the bottom right corner, as in Gmail (plan 6.3): the first opened is the
 * rightmost. Unsaved edits make leaving the page ask first; the drafts themselves live on the
 * server (no second store in the browser, plan 2.6).
 */
export function ComposeDock() {
  const windows = useCompose((s) => s.windows);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedDrafts()) return;
      e.preventDefault();
      e.returnValue = t.unsavedChanges;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (windows.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-0 z-30 flex flex-row-reverse items-end gap-4">
      {windows.map((w) => (
        <div key={w.key} className="pointer-events-auto">
          <ComposeWindow draftId={w.draftId} mode={w.mode} />
        </div>
      ))}
    </div>
  );
}
