import * as Progress from "@radix-ui/react-progress";
import type { ReactNode } from "react";
import type { UploadInfo } from "../../api/types";
import { Icon } from "../../components/Icon";
import { formatSize } from "../../lib/format";
import { t } from "../../lib/i18n";
import type { UploadItem } from "./session";

type Props = {
  attachments: UploadInfo[];
  uploads: UploadItem[];
  onRemove: (id: string) => void;
  onRemoveUpload: (key: number) => void;
};

function Chip({
  name,
  size,
  error,
  onRemove,
  children,
}: {
  name: string;
  size: number;
  error?: string;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <li
      className={`flex w-64 flex-col rounded border px-2 py-1 ${error ? "border-error-ink bg-error-bg text-error-ink" : "border-line bg-surface"}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-primary" title={name}>
          {name}
        </span>
        <span className="shrink-0 text-xs text-ink-muted">{formatSize(size)}</span>
        <button
          type="button"
          aria-label={t.removeAttachment(name)}
          onClick={onRemove}
          className="flex size-6 items-center justify-center rounded-full hover:bg-hover"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs">
          {error}
        </p>
      )}
      {children}
    </li>
  );
}

/** Attachments of the draft and uploads in progress with their progress bars (plan 5.6). */
export function AttachmentList({ attachments, uploads, onRemove, onRemoveUpload }: Props) {
  if (attachments.length === 0 && uploads.length === 0) return null;
  return (
    <ul aria-label={t.attachments} className="flex flex-wrap gap-2 px-3 py-2">
      {attachments.map((a) => (
        <Chip key={a.id} name={a.filename} size={a.size} onRemove={() => onRemove(a.id)} />
      ))}
      {uploads.map((u) => (
        <Chip
          key={u.key}
          name={u.name}
          size={u.size}
          error={u.error}
          onRemove={() => onRemoveUpload(u.key)}
        >
          {!u.error && (
            <Progress.Root
              value={Math.round(u.progress * 100)}
              aria-label={t.uploading(u.name)}
              className="mt-1 h-1 overflow-hidden rounded bg-line"
            >
              <Progress.Indicator
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round(u.progress * 100)}%` }}
              />
            </Progress.Root>
          )}
        </Chip>
      ))}
    </ul>
  );
}
