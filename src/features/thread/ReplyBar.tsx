import * as Tooltip from "@radix-ui/react-tooltip";
import { Icon, type IconName } from "../../components/Icon";
import { t } from "../../lib/i18n";

const BUTTONS: [IconName, string][] = [
  ["reply", t.reply],
  ["replyAll", t.replyAll],
  ["forward", t.forward],
];

/** Reply / reply all / forward: placeholders until compose lands (next slice). */
export function ReplyBar() {
  return (
    <div className="mt-4 flex gap-2 pl-14">
      {BUTTONS.map(([icon, label]) => (
        <Tooltip.Root key={icon}>
          <Tooltip.Trigger asChild>
            {/* A disabled button gets no pointer events; the wrapper keeps the tooltip. */}
            <span tabIndex={0} className="rounded-full">
              <button
                type="button"
                disabled
                className="flex items-center gap-2 rounded-full border border-line px-5 py-2 font-medium text-ink-muted"
              >
                <Icon name={icon} size={18} />
                {label}
              </button>
            </span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              sideOffset={4}
              className="z-50 rounded bg-tooltip px-2 py-1 text-xs text-white"
            >
              {t.comingSoon}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ))}
    </div>
  );
}
