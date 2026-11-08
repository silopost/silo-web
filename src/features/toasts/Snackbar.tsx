import { useEffect } from "react";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { useToasts } from "../../state/toasts";

/** "Conversation archived · Undo" (plan 6.3); announced politely to screen readers (plan 6.7). */
export function Snackbar() {
  const current = useToasts((s) => s.current);
  const dismiss = useToasts((s) => s.dismiss);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => dismiss(current.id), Math.max(0, current.hideAt - Date.now()));
    return () => clearTimeout(timer);
  }, [current, dismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-6 z-50"
    >
      {current && (
        <div className="pointer-events-auto flex min-w-72 items-center gap-4 rounded bg-snackbar py-2 pr-2 pl-4 text-white shadow-lg">
          <span className="flex-1">{current.message}</span>
          {current.action && (
            <button
              type="button"
              onClick={current.action.run}
              className="rounded px-2 py-1 font-medium text-[#a8c7fa] hover:bg-white/10"
            >
              {current.action.label}
            </button>
          )}
          <IconButton
            icon="close"
            label={t.close}
            onClick={() => dismiss(current.id)}
            className="size-8 text-white hover:bg-white/10"
          />
        </div>
      )}
    </div>
  );
}
