import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, expect, it } from "vitest";
import { CollapsedQuote } from "./collapsedQuote";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const make = (content: string) => {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, CollapsedQuote],
    content,
  });
  return editor;
};
const hidden = (e: Editor) =>
  Array.from(e.view.dom.querySelectorAll(".quote-collapsed")).map((n) => n.textContent);
/** Position right after the text `text`. */
const after = (e: Editor, text: string) => {
  let at = -1;
  e.state.doc.descendants((n, pos) => {
    if (n.isText && n.text === text) at = pos + text.length;
  });
  return at;
};
const toggle = (e: Editor) => e.view.dom.querySelector<HTMLButtonElement>("button.quote-toggle");

const REPLY =
  "<p></p><p>On Mon, 2 Nov 2026 at 10:00, Ann wrote:</p><blockquote><p>Old</p></blockquote>";

it("hides the quote and its header line behind a toggle that is not part of the HTML", () => {
  const e = make(REPLY);
  expect(hidden(e)).toEqual(["On Mon, 2 Nov 2026 at 10:00, Ann wrote:", "Old"]);
  expect(toggle(e)).toHaveAccessibleName("Show trimmed content");
  expect(e.getHTML()).toBe(REPLY);
  expect(e.getHTML()).not.toContain("quote-toggle");
});

it("opens the quote with the toggle; it can then be edited", () => {
  const e = make(REPLY);
  toggle(e)!.click();
  expect(hidden(e)).toEqual([]);
  expect(toggle(e)).toBeNull();
  e.commands.insertContentAt(after(e, "Old"), " edited");
  expect(e.getHTML()).toContain("<blockquote><p>Old edited</p></blockquote>");
});

it("opens when the caret moves into the quote", () => {
  const e = make(REPLY);
  e.commands.setTextSelection(1);
  expect(toggle(e)).not.toBeNull();
  e.commands.setTextSelection(after(e, "Old"));
  expect(toggle(e)).toBeNull();
});

it("leaves texts without a trailing quote, or with nothing above it, alone", () => {
  expect(hidden(make("<p>Hi</p><blockquote><p>q</p></blockquote><p>after</p>"))).toEqual([]);
  expect(hidden(make("<blockquote><p>q</p></blockquote>"))).toEqual([]);
  // A forward: no blockquote.
  expect(hidden(make("<p></p><p>---------- Forwarded message ---------</p><p>x</p>"))).toEqual([]);
});
