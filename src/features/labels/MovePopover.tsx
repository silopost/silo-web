import * as Popover from "@radix-ui/react-popover";
import { useLabels } from "../../api/queries/labels";
import { Icon, type IconName } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { SYSTEM_VIEWS } from "../../lib/labels";
import { moveCommand, type MoveCommand, type MoveTarget } from "./move";

const SYSTEM_TARGETS: { id: "INBOX" | "ARCHIVE" | "TRASH" | "SPAM"; icon: IconName }[] = [
  { id: "INBOX", icon: "inbox" },
  { id: "ARCHIVE", icon: "archive" },
  { id: "SPAM", icon: "report" },
  { id: "TRASH", icon: "delete" },
];

type Props = {
  accountId: string;
  /** Current labels of each target thread. */
  threads: { id: string; labelIds: string[] }[];
  onMove: (command: MoveCommand) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** "Move to": Inbox, Archive, Spam, Trash and the server folders of the account. */
export function MovePopover({ accountId, threads, onMove, open, onOpenChange }: Props) {
  const folders = useLabels(accountId).filter((l) => l.type === "folder");
  const pick = (target: MoveTarget) => {
    onOpenChange?.(false);
    onMove(moveCommand(target, threads, folders));
  };
  const item =
    "flex w-full items-center gap-3 rounded px-2 py-1 text-left hover:bg-hover focus:bg-hover";

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <IconButton icon="moveTo" label={t.moveTo} disabled={threads.length === 0} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-64 rounded-lg bg-panel p-2 shadow-lg"
          aria-label={t.moveTo}
        >
          <p className="px-2 pb-1 font-medium">{t.moveTo}</p>
          <ul className="max-h-72 overflow-auto">
            {SYSTEM_TARGETS.map((s) => (
              <li key={s.id}>
                <button type="button" className={item} onClick={() => pick(s.id)}>
                  <Icon name={s.icon} size={18} />
                  {SYSTEM_VIEWS.find((v) => v.labelId === s.id)?.name ?? s.id}
                </button>
              </li>
            ))}
            {folders.map((f) => (
              <li key={f.id}>
                <button type="button" className={item} onClick={() => pick(f)}>
                  <Icon name="folder" size={18} />
                  <span className="truncate">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
