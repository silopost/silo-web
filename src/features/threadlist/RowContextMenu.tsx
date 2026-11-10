import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { t } from "../../lib/i18n";

/** A command of the menu; picking it closes the menu. */
export type ContextMenuAction = {
  kind?: "action";
  key: string;
  icon: IconName;
  label: string;
  run: () => void;
};
/** A checkbox (user labels): checked, mixed (some of the threads) or not. */
export type ContextMenuCheck = {
  kind: "check";
  key: string;
  label: string;
  checked: boolean | "indeterminate";
  run: () => void;
};
/** A submenu ("Move to", "Label as"); with no items it shows `empty`, disabled, or is left out. */
export type ContextMenuSubmenu = {
  kind: "submenu";
  key: string;
  icon: IconName;
  label: string;
  items: (ContextMenuAction | ContextMenuCheck)[];
  empty?: string;
};
export type ContextMenuItem = ContextMenuAction | ContextMenuSubmenu;

type Props = {
  /** Cursor position (viewport px); null closes the menu. */
  at: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
  /** Focus after closing (the anchor is not focusable). */
  onCloseAutoFocus: (event: Event) => void;
};

const item =
  "flex cursor-pointer items-center gap-3 rounded px-3 py-2 outline-none data-[disabled]:cursor-default data-[disabled]:text-ink-muted data-[highlighted]:bg-hover data-[state=open]:bg-hover";
const panel =
  "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-lg bg-raised p-1 shadow-lg";

function Entry({ i }: { i: ContextMenuAction | ContextMenuCheck }) {
  if (i.kind === "check") {
    return (
      <DropdownMenu.CheckboxItem className={item} checked={i.checked} onSelect={i.run}>
        <span className="flex size-[18px] shrink-0 items-center justify-center">
          <DropdownMenu.ItemIndicator>
            <Icon name={i.checked === "indeterminate" ? "remove" : "check"} size={18} />
          </DropdownMenu.ItemIndicator>
        </span>
        <span className="truncate">{i.label}</span>
      </DropdownMenu.CheckboxItem>
    );
  }
  return (
    <DropdownMenu.Item className={item} onSelect={i.run}>
      <Icon name={i.icon} size={18} />
      <span className="truncate">{i.label}</span>
    </DropdownMenu.Item>
  );
}

/**
 * Right-click menu of a list row, as in Gmail: opened at the cursor (Radix flips and shifts it
 * to stay in the viewport), closed by Escape, a click outside, a pick, scrolling or resizing.
 * Submenus open with ArrowRight or on hover, ArrowLeft/Escape go back; a pick in a submenu
 * (a move, or toggling a label) closes the whole menu, as in Gmail.
 */
export function RowContextMenu({ at, items, onClose, onCloseAutoFocus }: Props) {
  const open = at !== null;
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      // Scrolling inside the menu or a submenu (long label lists) keeps it open.
      if (e.target instanceof Element && e.target.closest("[data-row-context-menu]")) return;
      onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);

  return (
    <DropdownMenu.Root open={open} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none fixed size-0"
          style={at ? { left: at.x, top: at.y } : { left: 0, top: 0 }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-row-context-menu=""
          align="start"
          side="bottom"
          collisionPadding={8}
          aria-label={t.threadActionsMenu}
          aria-labelledby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          className={`${panel} min-w-56`}
        >
          {items.map((i) =>
            i.kind === "submenu" ? (
              i.items.length === 0 && !i.empty ? null : (
                <DropdownMenu.Sub key={i.key}>
                  <DropdownMenu.SubTrigger className={item}>
                    <Icon name={i.icon} size={18} />
                    <span className="flex-1">{i.label}</span>
                    <Icon name="chevronRight" size={18} className="-mr-1 text-ink-muted" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      data-row-context-menu=""
                      collisionPadding={8}
                      aria-label={i.label}
                      className={`${panel} w-60`}
                    >
                      {i.items.length === 0 ? (
                        <DropdownMenu.Item className={item} disabled>
                          {i.empty}
                        </DropdownMenu.Item>
                      ) : (
                        i.items.map((s) => <Entry key={s.key} i={s} />)
                      )}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
              )
            ) : (
              <Entry key={i.key} i={i} />
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
