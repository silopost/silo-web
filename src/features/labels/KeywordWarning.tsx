import * as Tooltip from "@radix-ui/react-tooltip";
import { Icon } from "../../components/Icon";

/** Small warning icon with the text as tooltip and accessible name. */
export function KeywordWarning({
  text,
  size = 16,
  plain = false,
}: {
  text: string | null;
  size?: number;
  /** Inside a link: no focus stop and no tooltip of its own (the title shows the text). */
  plain?: boolean;
}) {
  if (!text) return null;
  if (plain) {
    return (
      <span
        role="img"
        aria-label={text}
        title={text}
        className="inline-flex shrink-0 text-warn-ink"
        data-keyword-warning=""
      >
        <Icon name="warning" size={size} />
      </span>
    );
  }
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span
          role="img"
          aria-label={text}
          tabIndex={0}
          className="inline-flex shrink-0 text-warn-ink"
          data-keyword-warning=""
        >
          <Icon name="warning" size={size} />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={4}
          className="z-50 max-w-72 rounded bg-tooltip px-2 py-1 text-xs text-white shadow"
        >
          {text}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
