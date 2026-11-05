import DOMPurify from "dompurify";

/** What pasted HTML may keep: the formats the compose editor supports (plan 7, Faza 3 risks). */
const PASTE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "pre",
    "code",
    "hr",
    "img",
    "div",
    "span",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

/** Sanitises HTML pasted into the editor (TipTap transformPastedHTML). */
export function sanitizePastedHtml(html: string): string {
  return DOMPurify.sanitize(html, PASTE_CONFIG);
}
