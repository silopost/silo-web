import type { MessageAttachment } from "../../api/types";
import { Icon } from "../../components/Icon";
import { formatSize } from "../../lib/format";
import { t } from "../../lib/i18n";

/** Download links of a message's attachments (GET /attachments/{id}), with their size. */
export function AttachmentChips({ attachments }: { attachments: MessageAttachment[] }) {
  const files = attachments.filter((a) => !a.inline);
  if (files.length === 0) return null;
  return (
    <ul aria-label={t.attachments} className="mt-3 flex flex-wrap gap-2">
      {files.map((a) => (
        <li key={a.id}>
          <a
            href={`/api/v1/attachments/${encodeURIComponent(a.id)}`}
            download={a.filename}
            aria-label={`${t.download(a.filename)} (${formatSize(a.size)})`}
            className="flex max-w-60 items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-hover"
          >
            <Icon name="attach" size={18} className="shrink-0 text-ink-muted" />
            <span className="truncate">{a.filename}</span>
            <span className="shrink-0 text-xs text-ink-muted">{formatSize(a.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
