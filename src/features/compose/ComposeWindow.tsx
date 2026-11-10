import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { useCompose, type WindowMode } from "../../state/compose";
import { ComposeFrame } from "./ComposeFrame";

/**
 * Position and size per mode. Docked windows are `relative` (anchor of the drop overlay); the
 * maximised one is `fixed` to the viewport, centred above its backdrop. Never combine the two
 * position utilities: Tailwind emits `.relative` after `.fixed`, so `relative` would win and
 * the insets would push the window off screen instead of placing it.
 */
const SIZE: Record<WindowMode, string> = {
  normal: "relative rounded-t-xl h-[min(36rem,85vh)] w-[min(34rem,95vw)]",
  minimized: "relative rounded-t-xl w-64",
  maximized: "fixed inset-x-[8vw] top-[5vh] bottom-[5vh] z-40 rounded-xl",
};

/**
 * One compose window of the dock (plan 6.3): a non-modal dialog around ComposeFrame with the
 * minimise, full screen and close buttons.
 */
export function ComposeWindow({ draftId, mode }: { draftId: string; mode: WindowMode }) {
  const setMode = useCompose((s) => s.setMode);
  const minimized = mode === "minimized";
  const maximized = mode === "maximized";

  return (
    <>
      {maximized && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-scrim"
          onClick={() => setMode(draftId, "normal")}
        />
      )}
      <ComposeFrame
        draftId={draftId}
        role="dialog"
        collapsed={minimized}
        // A raised surface: its panel colour is the one of menus and dialogs (dark theme: lighter).
        className={`shadow-2xl [--color-panel:var(--color-raised)] ${SIZE[mode]}`}
        header={(title, session) => (
          <header
            className="flex h-10 shrink-0 cursor-pointer items-center rounded-t-xl bg-surface pl-4"
            onClick={() => setMode(draftId, minimized ? "normal" : "minimized")}
          >
            <h2 className="min-w-0 flex-1 truncate font-medium">{title}</h2>
            <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
              <IconButton
                icon="minimize"
                label={minimized ? t.restore : t.minimize}
                className="size-8"
                onClick={() => setMode(draftId, minimized ? "normal" : "minimized")}
              />
              <IconButton
                icon={maximized ? "closeFullscreen" : "openInFull"}
                label={maximized ? t.exitMaximize : t.maximize}
                size={16}
                className="size-8"
                onClick={() => setMode(draftId, maximized ? "normal" : "maximized")}
              />
              <IconButton
                icon="close"
                label={t.saveAndClose}
                className="size-8"
                onClick={() => void session.close()}
              />
            </div>
          </header>
        )}
      />
    </>
  );
}
