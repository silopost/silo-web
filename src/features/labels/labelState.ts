/** How many of the target threads carry a label: all, some (mixed) or none. */
export type LabelState = "all" | "some" | "none";

export function labelState(threads: { labelIds: string[] }[], labelId: string): LabelState {
  const count = threads.filter((th) => th.labelIds.includes(labelId)).length;
  if (count > 0 && count === threads.length) return "all";
  return count > 0 ? "some" : "none";
}

/**
 * The change of a click on a label checkbox (toolbar popover and row menu): a label all the
 * threads carry is removed, otherwise (none or mixed) it is added to all of them.
 */
export const labelToggle = (state: LabelState, labelId: string): [string[], string[]] =>
  state === "all" ? [[], [labelId]] : [[labelId], []];
