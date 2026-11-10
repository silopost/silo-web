import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef } from "react";
import type { SelectKind } from "./selection";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";

const items = (): [SelectKind, string][] => [
  ["all", t.selectAll],
  ["none", t.selectNone],
  ["read", t.selectRead],
  ["unread", t.selectUnread],
  ["starred", t.selectStarred],
  ["unstarred", t.selectUnstarred],
];

type Props = {
  total: number;
  selected: number;
  onSelect: (kind: SelectKind) => void;
};

/** Master checkbox with the selection menu (plan 6.3 ListToolbar). */
export function SelectMenu({ total, selected, onSelect }: Props) {
  const box = useRef<HTMLInputElement>(null);
  const all = total > 0 && selected === total;
  useEffect(() => {
    if (box.current) box.current.indeterminate = selected > 0 && !all;
  }, [selected, all]);

  return (
    <div className="flex items-center rounded hover:bg-hover">
      <input
        ref={box}
        type="checkbox"
        checked={all}
        onChange={() => onSelect(selected > 0 ? "none" : "all")}
        aria-label={t.select}
        className="mr-1 ml-2 size-4 accent-primary"
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={t.selectMenu}
          className="flex h-8 w-6 items-center justify-center text-ink-muted"
        >
          <Icon name="arrowDropDown" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            className="z-50 min-w-40 rounded-lg bg-raised p-1 shadow-lg"
          >
            {items().map(([kind, label]) => (
              <DropdownMenu.Item
                key={kind}
                onSelect={() => onSelect(kind)}
                className="cursor-pointer rounded px-3 py-2 outline-none data-[highlighted]:bg-hover"
              >
                {label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
