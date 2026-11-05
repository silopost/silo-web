import type { Address } from "../api/types";
import { initial } from "../lib/format";

const COLORS = ["#1a73e8", "#d93025", "#188038", "#e37400", "#a142f4", "#007b83", "#c5221f"];

function colorOf(email: string): string {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

/** Circle with the first letter of the name (plan 6.3 MessageCard). */
export function Avatar({ address }: { address: Pick<Address, "email" | "name"> }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[var(--avatar-size)] shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
      style={{ backgroundColor: colorOf(address.email) }}
    >
      {initial(address)}
    </span>
  );
}
