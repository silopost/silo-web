import * as Popover from "@radix-ui/react-popover";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor as TiptapEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../../components/IconButton";
import type { IconName } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { sanitizePastedHtml } from "../../lib/pasteHtml";

type Props = {
  /** Id of the editable element (focus on open). */
  id: string;
  /** TipTap JSON, or HTML (the server's prefill for replies) when there is none. */
  content: unknown;
  /** Grows when the draft is (re)loaded from the server: the content is replaced. */
  loadSeq: number;
  onChange: (html: string, json: unknown) => void;
  /** Files pasted or dropped into the text. */
  onFiles: (files: File[]) => void;
};

const filesOf = (list: FileList | null | undefined) => (list ? Array.from(list) : []);

/** Rich text of the message (plan 6.1): TipTap with StarterKit, Link, Placeholder and Image. */
export function Editor({ id, content, loadSeq, onChange, onFiles }: Props) {
  const callbacks = useRef({ onChange, onFiles });
  useEffect(() => {
    callbacks.current = { onChange, onFiles };
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      Placeholder.configure({ placeholder: t.bodyPlaceholder }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: (content as string | object | null) ?? "",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": t.messageBody,
        class: "compose-body min-h-32 px-3 py-2 outline-none",
      },
      transformPastedHTML: sanitizePastedHtml,
      // Pasted or dropped files become attachments; inline images (cid:) need server support.
      handlePaste: (_view, event) => {
        const files = filesOf(event.clipboardData?.files);
        if (files.length === 0) return false;
        callbacks.current.onFiles(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = filesOf((event as DragEvent).dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        callbacks.current.onFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => callbacks.current.onChange(e.getHTML(), e.getJSON()),
  });

  const applied = useRef(loadSeq);
  useEffect(() => {
    if (!editor || applied.current === loadSeq) return;
    applied.current = loadSeq;
    editor.commands.setContent((content as string | object | null) ?? "", { emitUpdate: false });
  }, [editor, loadSeq, content]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      {editor && <Toolbar editor={editor} />}
    </div>
  );
}

function Toolbar({ editor }: { editor: TiptapEditor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      link: e.isActive("link"),
    }),
  });
  const chain = () => editor.chain().focus();
  const buttons: [IconName, string, boolean, () => void][] = [
    ["formatBold", t.bold, state.bold, () => chain().toggleBold().run()],
    ["formatItalic", t.italic, state.italic, () => chain().toggleItalic().run()],
    ["formatUnderlined", t.underline, state.underline, () => chain().toggleUnderline().run()],
    ["bulletList", t.bulletList, state.bulletList, () => chain().toggleBulletList().run()],
    ["orderedList", t.orderedList, state.orderedList, () => chain().toggleOrderedList().run()],
    ["formatQuote", t.quote, state.blockquote, () => chain().toggleBlockquote().run()],
  ];
  return (
    <div
      role="toolbar"
      aria-label={t.formatting}
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-t border-line px-2 py-1"
    >
      {buttons.map(([icon, label, active, run]) => (
        <IconButton
          key={icon}
          icon={icon}
          label={label}
          aria-pressed={active}
          onClick={run}
          className={`size-8 ${active ? "bg-hover text-ink" : ""}`}
        />
      ))}
      <LinkButton editor={editor} active={state.link} />
      <IconButton
        icon="formatClear"
        label={t.clearFormatting}
        onClick={() => chain().unsetAllMarks().clearNodes().run()}
        className="size-8"
      />
    </div>
  );
}

function LinkButton({ editor, active }: { editor: TiptapEditor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const apply = () => {
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href.trim()) chain.setLink({ href: href.trim() }).run();
    else chain.unsetLink().run();
    setOpen(false);
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (o) setHref((editor.getAttributes("link").href as string | undefined) ?? "");
        setOpen(o);
      }}
    >
      <Popover.Trigger asChild>
        <IconButton
          icon="link"
          label={t.link}
          aria-pressed={active}
          className={`size-8 ${active ? "bg-hover text-ink" : ""}`}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={4}
          className="z-50 flex items-center gap-2 rounded-lg bg-panel p-2 shadow-lg"
          onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}
        >
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <label className="sr-only" htmlFor="compose-link-url">
              {t.linkUrl}
            </label>
            <input
              id="compose-link-url"
              type="url"
              autoFocus
              value={href}
              placeholder="https://"
              onChange={(e) => setHref(e.target.value)}
              className="w-56 rounded border border-line px-2 py-1"
            />
            <button type="submit" className="rounded px-2 py-1 font-medium text-primary">
              {t.apply}
            </button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
