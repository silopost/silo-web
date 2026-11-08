import * as Popover from "@radix-ui/react-popover";
import { useLabels } from "../../api/queries/labels";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import {
  moveCommand,
  SYSTEM_TARGETS,
  systemTargetName,
  type MoveCommand,
  type MoveTarget,
} from "./move";

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
                  {systemTargetName(s.id)}
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
