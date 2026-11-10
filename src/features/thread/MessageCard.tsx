import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import type { DraftMode } from "../../api/drafts";
import type { Address, Message } from "../../api/types";
import { Avatar } from "../../components/Avatar";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { displayName, formatFullDate, formatListDate } from "../../lib/format";
import { t } from "../../lib/i18n";
import { toast } from "../../state/toasts";
import { PendingIcon } from "../sync/PendingIcon";
import { AttachmentChips } from "./AttachmentChips";
import { MessageHtmlFrame } from "./MessageHtmlFrame";

type Props = {
  message: Message;
  expanded: boolean;
  /** Address of the account, to say "do mnie". */
  me: string;
  onToggle: () => void;
  onStar: (starred: boolean) => void;
  onReply: (mode: DraftMode) => void;
};

const list = (as: Address[] | null) => (as ?? []).map(displayName).join(", ");

function Recipients({ message, me }: { message: Message; me: string }) {
  const [open, setOpen] = useState(false);
  const to = message.to ?? [];
  const short =
    to.length === 1 && to[0]!.email.toLowerCase() === me.toLowerCase()
      ? t.toMe
      : `${t.to} ${list(to)}`;
  return (
    <div className="text-xs text-ink-muted">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${short}. ${t.recipients}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex min-h-6 items-center rounded hover:bg-hover"
      >
        {short}
        <Icon name="arrowDropDown" size={16} />
      </button>
      {open && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 rounded border border-line p-2">
          <dt>{t.from}:</dt>
          <dd>
            {displayName(message.from)} &lt;{message.from.email}&gt;
          </dd>
          <dt>{t.toLabel}:</dt>
          <dd>{(message.to ?? []).map((a) => a.email).join(", ")}</dd>
          {(message.cc ?? []).length > 0 && (
            <>
              <dt>{t.cc}:</dt>
              <dd>{(message.cc ?? []).map((a) => a.email).join(", ")}</dd>
            </>
          )}
          <dt>{t.date}:</dt>
          <dd>{formatFullDate(message.date)}</dd>
        </dl>
      )}
    </div>
  );
}

/** Whether the user has selected text (dragging over the sender to copy it): not a click. */
const selecting = () => (window.getSelection()?.toString() ?? "") !== "";

async function copyAddress(email: string) {
  try {
    await navigator.clipboard.writeText(email);
    toast(t.copied);
  } catch {
    toast(t.genericError);
  }
}

/** One message of a thread: collapsed to a line, or expanded with header, body and files. */
export function MessageCard({ message, expanded, me, onToggle, onStar, onReply }: Props) {
  const sending = (message.labelIds ?? []).includes("SCHEDULED");
  const starred = (message.labelIds ?? []).includes("STARRED");
  const unread = (message.labelIds ?? []).includes("UNREAD");

  if (!expanded) {
    return (
      <article
        data-message-id={message.id}
        tabIndex={-1}
        aria-label={`${displayName(message.from)}, ${formatListDate(message.date)}`}
        className="flex cursor-pointer items-center gap-3 border-t border-line px-4 py-3 hover:bg-surface"
        onClick={onToggle}
      >
        <Avatar address={message.from} />
        <button
          type="button"
          aria-expanded={false}
          className={`w-48 shrink-0 truncate text-left ${unread ? "font-bold" : ""}`}
        >
          {displayName(message.from)}
        </button>
        <span className="min-w-0 flex-1 truncate text-ink-muted">{message.snippet}</span>
        <span className="shrink-0 text-xs text-ink-muted">{formatListDate(message.date)}</span>
      </article>
    );
  }

  return (
    <article
      data-message-id={message.id}
      tabIndex={-1}
      aria-label={`${displayName(message.from)}, ${formatFullDate(message.date)}`}
      className="border-t border-line px-4 py-3"
    >
      <header className="flex items-start gap-3">
        <Avatar address={message.from} />
        {/* A click collapses the message, but not the end of a drag that selects the sender's
            name or address to copy them: a div with role=button, as a <button> keeps its text
            from being selected. */}
        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={() => {
            if (!selecting()) onToggle();
          }}
        >
          <div className="flex min-w-0 items-center gap-1">
            <div
              role="button"
              tabIndex={0}
              aria-expanded
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                onToggle();
              }}
              className="min-w-0 select-text truncate rounded text-left"
            >
              <span className="font-bold">{displayName(message.from)}</span>{" "}
              {message.from.email && (
                <span className="text-xs text-ink-muted">&lt;{message.from.email}&gt;</span>
              )}
            </div>
            {message.from.email && (
              <IconButton
                icon="contentCopy"
                label={t.copyAddress}
                size={16}
                className="size-7"
                onClick={(e) => {
                  e.stopPropagation();
                  void copyAddress(message.from.email);
                }}
              />
            )}
          </div>
          <Recipients message={message} me={me} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <PendingIcon pending={message.pendingSync} />
          {sending && (
            <span className="text-ink-muted" title={t.scheduledLabel}>
              <Icon name="schedule" size={16} />
              <span className="sr-only">{t.scheduledLabel}</span>
            </span>
          )}
          <span className="text-xs text-ink-muted" title={formatFullDate(message.date)}>
            {formatListDate(message.date)}
          </span>
          <IconButton
            icon={starred ? "star" : "starBorder"}
            label={starred ? t.unstar : t.star}
            aria-pressed={starred}
            className={starred ? "text-star" : ""}
            onClick={() => onStar(!starred)}
          />
          {!sending && <IconButton icon="reply" label={t.reply} onClick={() => onReply("reply")} />}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <IconButton icon="moreVert" label={t.messageMenu} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-48 rounded-lg bg-panel p-1 shadow-lg"
              >
                {!sending &&
                  (
                    [
                      ["reply", t.reply],
                      ["replyAll", t.replyAll],
                      ["forward", t.forward],
                    ] as const
                  ).map(([mode, label]) => (
                    <DropdownMenu.Item
                      key={mode}
                      onSelect={() => onReply(mode)}
                      className="rounded px-3 py-2 outline-none data-[highlighted]:bg-hover"
                    >
                      {label}
                    </DropdownMenu.Item>
                  ))}
                <DropdownMenu.Item asChild>
                  <a
                    href={`/api/v1/messages/${encodeURIComponent(message.id)}/raw`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded px-3 py-2 outline-none data-[highlighted]:bg-hover"
                  >
                    {t.showOriginal}
                  </a>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>
      <div className="mt-3 pl-14">
        <MessageHtmlFrame
          messageId={message.id}
          subject={message.subject}
          sender={message.from.email ?? ""}
        />
        <AttachmentChips attachments={message.attachments ?? []} />
      </div>
    </article>
  );
}
