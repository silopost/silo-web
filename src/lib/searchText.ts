/**
 * Text helpers of the search box. The client has no query parser (plan 2.6): the server parses
 * and runs queries. Here a query is only split for display (SearchChips) and put together from
 * the fields of AdvancedSearchPopover, both as plain text.
 */

/**
 * Splits a query at the spaces that are outside "quotes" and (brackets) / {braces}, so that each
 * part can be shown as a chip: `from:jan "umowa najmu" (a OR b)` → 3 parts. Nothing is
 * interpreted: an operator, a word and a group are all just text.
 */
export function splitQuery(q: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let depth = 0;
  for (const ch of q) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "(" || ch === "{")) depth += 1;
    else if (!quoted && (ch === ")" || ch === "}") && depth > 0) depth -= 1;
    if (/\s/.test(ch) && !quoted && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** The query without its index-th part (removing a chip). */
export function withoutPart(q: string, index: number): string {
  return splitQuery(q)
    .filter((_, i) => i !== index)
    .join(" ");
}

/** A value with spaces in quotes, as Gmail writes it: subject:"umowa najmu". */
export function quoteValue(value: string): string {
  const v = value.trim().replace(/"/g, "");
  return /\s/.test(v) ? `"${v}"` : v;
}

/** The value of a date field ("2026-11-05") in the query syntax ("2026/11/05"). */
export function dateFieldToQuery(value: string): string {
  return value.replace(/-/g, "/");
}

export type SizeUnit = "M" | "K" | "";

export type AdvancedFields = {
  from: string;
  to: string;
  subject: string;
  hasWords: string;
  notWords: string;
  hasAttachment: boolean;
  sizeOp: "larger" | "smaller";
  size: string;
  sizeUnit: SizeUnit;
  /** Date fields (YYYY-MM-DD). */
  after: string;
  before: string;
  /** Text to add as is: "" (all mail), "in:inbox", "is:starred", "label:Projekty"... */
  searchIn: string;
};

export const emptyAdvanced: AdvancedFields = {
  from: "",
  to: "",
  subject: "",
  hasWords: "",
  notWords: "",
  hasAttachment: false,
  sizeOp: "larger",
  size: "",
  sizeUnit: "M",
  after: "",
  before: "",
  searchIn: "",
};

/**
 * The query of the advanced search form: `key:value` parts joined with spaces, in Gmail's order
 * (from, to, subject, words, -words, has:attachment, size, dates, where).
 */
export function buildQuery(f: AdvancedFields): string {
  const parts: string[] = [];
  const add = (key: string, value: string) => {
    if (value.trim()) parts.push(`${key}:${quoteValue(value)}`);
  };
  add("from", f.from);
  add("to", f.to);
  add("subject", f.subject);
  if (f.hasWords.trim()) parts.push(f.hasWords.trim());
  const not = f.notWords.trim().split(/\s+/).filter(Boolean);
  if (not.length === 1) parts.push(`-${not[0]}`);
  else if (not.length > 1) parts.push(`-{${not.join(" ")}}`);
  if (f.hasAttachment) parts.push("has:attachment");
  if (f.size.trim()) parts.push(`${f.sizeOp}:${f.size.trim()}${f.sizeUnit}`);
  if (f.after) parts.push(`after:${dateFieldToQuery(f.after)}`);
  if (f.before) parts.push(`before:${dateFieldToQuery(f.before)}`);
  if (f.searchIn) parts.push(f.searchIn);
  return parts.join(" ");
}
