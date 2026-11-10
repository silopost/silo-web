import * as Tooltip from "@radix-ui/react-tooltip";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  /** Accessible name and tooltip. */
  label: string;
  size?: number;
};

/** Round icon button with aria-label and a tooltip (plan 6.7). */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { icon, label, size = 20, className = "", ...rest },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-40 ${className}`}
          {...rest}
        >
          <Icon name={icon} size={size} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={4}
          className="z-50 rounded bg-tooltip px-2 py-1 text-xs text-on-tooltip shadow"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
