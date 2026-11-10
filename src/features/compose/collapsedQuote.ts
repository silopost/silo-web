import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { t } from "../../lib/i18n";

/** Plugin state: whether the quote is still collapsed (true until the user opens it). */
export const collapsedQuoteKey = new PluginKey<boolean>("collapsedQuote");

/**
 * The quote of a reply as the server prefills it: the last top-level blockquote, the
 * "On …, … wrote:" line right above it and the empty paragraphs after it (the editor keeps one
 * there to type below the quote). Something must stay visible above it to type in, so a quote
 * that is (almost) the whole text is not a quote to collapse.
 */
export function quoteRange(doc: PmNode): { from: number; to: number } | null {
  const to = doc.content.size;
  let i = doc.childCount - 1;
  let from = to;
  while (i >= 0 && isEmptyParagraph(doc.child(i))) from -= doc.child(i--).nodeSize;
  if (i < 1 || doc.child(i).type.name !== "blockquote") return null;
  from -= doc.child(i--).nodeSize;
  const header = doc.child(i);
  if (i >= 1 && header.type.name === "paragraph" && /:s*$/.test(header.textContent)) {
    from -= header.nodeSize;
  }
  return { from, to };
}

const isEmptyParagraph = (n: PmNode) => n.type.name === "paragraph" && n.childCount === 0;

function toggleButton(onOpen: () => void): HTMLElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "quote-toggle";
  b.textContent = "⋯";
  b.setAttribute("aria-label", t.showTrimmedContent);
  b.title = t.showTrimmedContent;
  b.contentEditable = "false";
  // Keep the caret where it is: only the click opens the quote.
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onOpen();
  });
  return b;
}

/**
 * Gmail's "⋯" of a reply: the quote stays in the document (saved, sent, reloaded with the draft)
 * but is hidden behind a toggle until the user opens it; then it is edited like the rest of the
 * text. The toggle and the hiding are decorations, never part of the HTML. Moving the caret into
 * the quote (arrow keys) opens it too.
 */
export const CollapsedQuote = Extension.create({
  name: "collapsedQuote",
  addProseMirrorPlugins() {
    return [
      new Plugin<boolean>({
        key: collapsedQuoteKey,
        state: {
          init: () => true,
          apply(tr, collapsed) {
            const meta = tr.getMeta(collapsedQuoteKey) as boolean | undefined;
            if (meta !== undefined) return meta;
            if (!collapsed || !tr.selectionSet) return collapsed;
            const range = quoteRange(tr.doc);
            return !(range && tr.selection.from > range.from);
          },
        },
        props: {
          decorations(state) {
            if (!collapsedQuoteKey.getState(state)) return null;
            const range = quoteRange(state.doc);
            if (!range) return null;
            const decorations = [
              Decoration.widget(
                range.from,
                (view) =>
                  toggleButton(() => {
                    view.dispatch(view.state.tr.setMeta(collapsedQuoteKey, false));
                    view.focus();
                  }),
                { side: -1, key: "quote-toggle", ignoreSelection: true, stopEvent: () => true },
              ),
            ];
            state.doc.nodesBetween(range.from, range.to, (node, pos) => {
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, { class: "quote-collapsed" }),
              );
              return false;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
