import * as Popover from "@radix-ui/react-popover";
import { Node, mergeAttributes } from "@tiptap/core";
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
import type { UploadInfo } from "../../api/types";
import { IconButton } from "../../components/IconButton";
import type { IconName } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { inlinePreviewUrl } from "../../lib/inlineImages";
import { sanitizePastedHtml } from "../../lib/pasteHtml";

type Props = {
  /** Id of the editable element (focus on open). */
  id: string;
  /** Accessible name; the message body by default. */
  label?: string;
  /** TipTap JSON, or HTML (the server's prefill for replies) when there is none. */
  content: unknown;
  /** Grows when the draft is (re)loaded from the server: the content is replaced. */
  loadSeq: number;
  onChange: (html: string, json: unknown) => void;
  /** Files pasted or dropped into the text (not pictures, when onInlineImage is given). */
  onFiles?: (files: File[]) => void;
  /** Uploads a pasted or dropped picture as an inline upload (POST /uploads inline=true). */
  onInlineImage?: (file: File) => Promise<UploadInfo>;
};

const filesOf = (list: FileList | null | undefined) => (list ? Array.from(list) : []);

/**
 * Pictures with the cid of their inline upload (data-cid) and, while uploading, the key of the
 * placeholder (data-upload-key); lib/inlineImages turns them into cid: sources for the server.
 */
const InlineImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      cid: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-cid"),
        renderHTML: (a: { cid?: string | null }) => (a.cid ? { "data-cid": a.cid } : {}),
      },
      uploadKey: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-upload-key"),
        renderHTML: (a: { uploadKey?: string | null }) =>
          a.uploadKey ? { "data-upload-key": a.uploadKey } : {},
      },
    };
  },
});

/** The signature block of the settings (div.silo-signature), kept as is. */
const Signature = Node.create({
  name: "signature",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "div.silo-signature" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { class: "silo-signature" }),
    0,
  ],
});

let uploadKeySeq = 0;

/** Rich text of the message (plan 6.1): TipTap with StarterKit, Link, Placeholder and Image. */
export function Editor({ id, label, content, loadSeq, onChange, onFiles, onInlineImage }: Props) {
  const callbacks = useRef({ onChange, onFiles, onInlineImage });
  useEffect(() => {
    callbacks.current = { onChange, onFiles, onInlineImage };
  });
  const editorRef = useRef<TiptapEditor | null>(null);

  /** Puts a picture in the text at once (placeholder) and swaps in the upload when it is done. */
  const insertInline = (file: File) => {
    const e = editorRef.current;
    const upload = callbacks.current.onInlineImage;
    if (!e || !upload) return;
    const key = String(++uploadKeySeq);
    const preview = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
    e.chain()
      .focus()
      .insertContent({
        type: "image",
        attrs: { src: preview, alt: t.inlineUploading(file.name), uploadKey: key },
      })
      .run();
    const settle = (attrs: Record<string, unknown> | null) => {
      if (preview) URL.revokeObjectURL(preview);
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      ed.commands.command(({ tr, state }) => {
        state.doc.descendants((node, pos) => {
          if (node.type.name !== "image" || node.attrs.uploadKey !== key) return true;
          if (attrs) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
          else tr.delete(pos, pos + node.nodeSize);
          return false;
        });
        return true;
      });
    };
    upload(file).then(
      (info) =>
        settle({
          src: inlinePreviewUrl(info.id),
          alt: info.filename,
          cid: info.cid,
          uploadKey: null,
        }),
      () => settle(null),
    );
  };

  /** Pictures go in the text as inline uploads, other files to the attachments. */
  const takeFiles = (files: File[]): boolean => {
    const { onFiles: toAttachments, onInlineImage: upload } = callbacks.current;
    const pictures = upload ? files.filter((f) => f.type.startsWith("image/")) : [];
    const others = files.filter((f) => !pictures.includes(f));
    if (others.length > 0) toAttachments?.(others);
    for (const file of pictures) insertInline(file);
    return pictures.length > 0 || (others.length > 0 && !!toAttachments);
  };
  const take = useRef(takeFiles);
  useEffect(() => {
    take.current = takeFiles;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      Placeholder.configure({ placeholder: t.bodyPlaceholder }),
      InlineImage.configure({ inline: false, allowBase64: false }),
      Signature,
    ],
    content: (content as string | object | null) ?? "",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label ?? t.messageBody,
        class: "compose-body min-h-32 px-3 py-2 outline-none",
      },
      transformPastedHTML: sanitizePastedHtml,
      handlePaste: (_view, event) => {
        const files = filesOf(event.clipboardData?.files);
        if (files.length === 0) return false;
        return take.current(files);
      },
      handleDrop: (_view, event) => {
        const files = filesOf((event as DragEvent).dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        take.current(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => callbacks.current.onChange(e.getHTML(), e.getJSON()),
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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
