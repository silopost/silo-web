/**
 * Label colours (background, text) like Gmail's palette (plan 3.7): the server stores the two
 * values as given, so any pair works; these are the ones offered.
 */
export const LABEL_COLORS: { bg: string; text: string }[] = [
  { bg: "#fb4c2f", text: "#ffffff" },
  { bg: "#ffad47", text: "#ffffff" },
  { bg: "#fad165", text: "#000000" },
  { bg: "#16a766", text: "#ffffff" },
  { bg: "#43d692", text: "#ffffff" },
  { bg: "#4a86e8", text: "#ffffff" },
  { bg: "#a479e2", text: "#ffffff" },
  { bg: "#f691b3", text: "#ffffff" },
  { bg: "#f6c5be", text: "#994a64" },
  { bg: "#ffe6c7", text: "#a46a21" },
  { bg: "#fef1d1", text: "#aa8831" },
  { bg: "#b9e4d0", text: "#076239" },
  { bg: "#c6f3de", text: "#0b804b" },
  { bg: "#c9daf8", text: "#285bac" },
  { bg: "#e4d7f5", text: "#653e9b" },
  { bg: "#fcdee8", text: "#b65775" },
  { bg: "#cc3a21", text: "#ffffff" },
  { bg: "#0b804b", text: "#ffffff" },
  { bg: "#285bac", text: "#ffffff" },
  { bg: "#666666", text: "#ffffff" },
];

export const DEFAULT_LABEL_TEXT = "#1f1f1f";

/**
 * A chip of a label without a colour: theme tokens, not data, so that it follows the theme (the
 * default theme gives #e0e3e7 / #1f1f1f, as before themes).
 */
export const NO_COLOR_BG = "var(--color-line)";
export const NO_COLOR_TEXT = "var(--color-ink)";
