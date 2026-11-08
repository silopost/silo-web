import type { DraftMode } from "../../api/drafts";
import { Icon, type IconName } from "../../components/Icon";
import { t } from "../../lib/i18n";

const buttons = (): [IconName, string, DraftMode][] => [
  ["reply", t.reply, "reply"],
  ["replyAll", t.replyAll, "replyAll"],
  ["forward", t.forward, "forward"],
];

/** Reply / reply all / forward under the last message (plan 6.3). */
export function ReplyBar({ onReply }: { onReply: (mode: DraftMode) => void }) {
  return (
    <div className="mt-4 flex gap-2 pl-14">
      {buttons().map(([icon, label, mode]) => (
        <button
          key={icon}
          type="button"
          onClick={() => onReply(mode)}
          className="flex items-center gap-2 rounded-full border border-line px-5 py-2 font-medium text-ink-muted hover:bg-hover"
        >
          <Icon name={icon} size={18} />
          {label}
        </button>
      ))}
    </div>
  );
}
