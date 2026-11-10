import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { READING_PANES, usePrefs, type ReadingPane } from "../../state/ui";

const menuItem =
  "flex cursor-pointer items-center gap-2 rounded px-3 py-2 outline-none data-[highlighted]:bg-hover";

/** "Reading pane" button of the list toolbar (Gmail): no split, vertical or horizontal split. */
export function ReadingPaneMenu() {
  const mode = usePrefs((s) => s.readingPane);
  const setMode = usePrefs((s) => s.setReadingPane);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          icon={mode === "horizontal" ? "horizontalSplit" : "verticalSplit"}
          label={t.readingPane}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-48 rounded-lg bg-raised p-1 shadow-lg"
        >
          <DropdownMenu.Label className="px-3 py-1 text-xs text-ink-muted">
            {t.readingPane}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={mode} onValueChange={(v) => setMode(v as ReadingPane)}>
            {READING_PANES.map((m) => (
              <DropdownMenu.RadioItem key={m} value={m} className={menuItem}>
                <span className="w-4">{mode === m ? "✓" : ""}</span>
                {t.readingPanes[m]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
