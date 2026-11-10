import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { snoozePresetsQuery } from "../../api/queries/snooze";
import type { SnoozePreset } from "../../api/types";
import { DateTimeDialog } from "../../components/DateTimeDialog";
import { formatPresetTime } from "../../lib/format";
import { t } from "../../lib/i18n";

const item =
  "flex cursor-pointer items-center gap-6 rounded px-3 py-2 outline-none data-[highlighted]:bg-hover data-[disabled]:cursor-default data-[disabled]:text-ink-muted";

export type PresetTimeMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Heading of the menu and of the date and time dialog. */
  title: string;
  /** Polish label of a preset by its key; undefined leaves the preset out. */
  labelOf: (preset: SnoozePreset) => string | undefined;
  /** The chosen time (RFC 3339): a preset's `until` as the server sent it, or the picked one. */
  onPick: (until: string) => void;
  /** The trigger (rendered with asChild). */
  children: ReactNode;
  align?: "start" | "end";
  side?: "top" | "bottom";
  /** Where the focus goes when the menu closes (default: back to the trigger). */
  onCloseAutoFocus?: (event: Event) => void;
};

/**
 * A menu of times from GET /snooze/presets plus "Pick date & time" (plan 3.10, 6.3). The
 * server computes every preset in the user's time zone; the menu only translates and formats.
 */
export function PresetTimeMenu(p: PresetTimeMenuProps) {
  const [picking, setPicking] = useState(false);
  const presets = useQuery({ ...snoozePresetsQuery, enabled: p.open });
  const shown = (presets.data?.presets ?? []).flatMap((preset) => {
    const label = p.labelOf(preset);
    return label ? [{ preset, label }] : [];
  });

  return (
    <>
      <DropdownMenu.Root open={p.open} onOpenChange={p.onOpenChange}>
        <DropdownMenu.Trigger asChild>{p.children}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align={p.align ?? "start"}
            side={p.side}
            sideOffset={4}
            // Named by its heading, not by the trigger (an invisible anchor in the list).
            aria-label={p.title}
            aria-labelledby={undefined}
            onCloseAutoFocus={p.onCloseAutoFocus}
            className="z-50 min-w-64 rounded-lg bg-raised p-1 shadow-lg"
          >
            <DropdownMenu.Label className="px-3 py-1.5 text-sm text-ink-muted">
              {p.title}
            </DropdownMenu.Label>
            {presets.isPending && (
              <DropdownMenu.Item disabled className={item}>
                {t.loading}
              </DropdownMenu.Item>
            )}
            {presets.isError && (
              <DropdownMenu.Item disabled className={item}>
                {t.presetsError}
              </DropdownMenu.Item>
            )}
            {shown.map(({ preset, label }) => (
              <DropdownMenu.Item
                key={preset.key}
                className={item}
                onSelect={() => p.onPick(preset.until)}
              >
                <span className="flex-1">{label}</span>
                <span className="text-sm text-ink-muted">{formatPresetTime(preset.until)}</span>
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item className={item} onSelect={() => setPicking(true)}>
              {t.pickDateTime}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <DateTimeDialog
        open={picking}
        onOpenChange={setPicking}
        title={p.title}
        onSubmit={(iso) => {
          setPicking(false);
          p.onPick(iso);
        }}
      />
    </>
  );
}

const snoozeLabel = (preset: SnoozePreset) => t.snoozePresets[preset.key] ?? preset.label;

/** SnoozeMenu (plan 6.3): Gmail's "Snooze until…" with the server's presets. */
export function SnoozeMenu(
  props: Omit<PresetTimeMenuProps, "title" | "labelOf"> & { title?: string },
) {
  return <PresetTimeMenu {...props} title={props.title ?? t.snoozeUntil} labelOf={snoozeLabel} />;
}
