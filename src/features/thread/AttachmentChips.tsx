import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import type { MessageAttachment } from "../../api/types";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { formatSize } from "../../lib/format";
import { t } from "../../lib/i18n";

const url = (id: string) => `/api/v1/attachments/${encodeURIComponent(id)}`;
const thumbnailUrl = (id: string, size: "s" | "m" = "s") => `${url(id)}/thumbnail?size=${size}`;
const inlineUrl = (id: string) => `${url(id)}?inline=1`;

/**
 * A 64 px thumbnail (GET /attachments/{id}/thumbnail?size=s, plan 5.1) when the server says it
 * can make one (`thumbnail: true`), lazily loaded; otherwise, or when it fails, the type icon.
 */
export function Thumbnail({
  id,
  contentType,
  size = 40,
}: {
  id: string | undefined;
  contentType: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (id && !failed) {
    return (
      <img
        src={thumbnailUrl(id)}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="shrink-0 rounded object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <Icon
      name={contentType.startsWith("image/") ? "image" : "file"}
      size={Math.min(size, 24)}
      className="shrink-0 text-ink-muted"
    />
  );
}

/**
 * Attachments of a message (plan 6.3): thumbnail, name and size; a click on a picture opens it
 * in a dialog at its natural size, a PDF in a new tab (?inline=1), anything else downloads.
 */
export function AttachmentChips({ attachments }: { attachments: MessageAttachment[] }) {
  const [preview, setPreview] = useState<MessageAttachment | null>(null);
  const files = attachments.filter((a) => !a.inline);
  if (files.length === 0) return null;
  return (
    <>
      <ul aria-label={t.attachments} className="mt-3 flex flex-wrap gap-2">
        {files.map((a) => {
          const image = a.contentType.startsWith("image/");
          const pdf = a.contentType === "application/pdf";
          const label = `${a.filename} (${formatSize(a.size)})`;
          const body = (
            <>
              <Thumbnail id={a.thumbnail ? a.id : undefined} contentType={a.contentType} />
              <span className="min-w-0 flex-1 truncate">{a.filename}</span>
              <span className="shrink-0 text-xs text-ink-muted">{formatSize(a.size)}</span>
            </>
          );
          const chip = "flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-hover";
          return (
            <li key={a.id} className="flex max-w-72 items-center rounded-lg border border-line">
              {image ? (
                <button
                  type="button"
                  aria-label={t.preview(label)}
                  onClick={() => setPreview(a)}
                  className={chip}
                >
                  {body}
                </button>
              ) : pdf ? (
                <a
                  href={inlineUrl(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.preview(label)}
                  className={chip}
                >
                  {body}
                </a>
              ) : (
                <a
                  href={url(a.id)}
                  download={a.filename}
                  aria-label={t.download(label)}
                  className={chip}
                >
                  {body}
                </a>
              )}
              {(image || pdf) && (
                <a
                  href={url(a.id)}
                  download={a.filename}
                  aria-label={t.download(label)}
                  title={t.download(a.filename)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-hover"
                >
                  <Icon name="download" size={18} />
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <Dialog.Root open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
          <Dialog.Content className="fixed inset-4 z-50 flex flex-col items-center justify-center gap-2 outline-none">
            <div className="flex w-full items-center justify-between text-white">
              <Dialog.Title className="truncate">{preview?.filename}</Dialog.Title>
              <Dialog.Close asChild>
                <IconButton icon="close" label={t.close} className="text-white" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">{preview?.filename}</Dialog.Description>
            <div className="min-h-0 flex-1 overflow-auto">
              {preview && <img src={inlineUrl(preview.id)} alt={preview.filename} />}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
