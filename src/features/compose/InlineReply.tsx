import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { t } from "../../lib/i18n";
import { useCompose, type InlineReplyState } from "../../state/compose";
import { ComposeFrame } from "./ComposeFrame";

/**
 * A reply under the message it answers, in the column of the thread (as in Gmail). The same
 * ComposeFrame as the dock windows; "Open in a window" moves the draft to the dock.
 */
export function InlineReply({ reply }: { reply: InlineReplyState }) {
  const open = useCompose((s) => s.open);
  return (
    <div className="mt-2 mr-4 ml-14">
      <ComposeFrame
        draftId={reply.draftId}
        role="region"
        scrollOnLoad
        className="relative min-h-[22rem] rounded-xl border border-line shadow-md"
        header={(title, session) => (
          <header className="flex h-10 shrink-0 items-center gap-2 pl-4">
            <Icon name={reply.mode} size={18} className="shrink-0 text-ink-muted" />
            <h2 className="min-w-0 flex-1 truncate text-ink-muted">{title}</h2>
            <IconButton
              icon="openInFull"
              label={t.openInWindow}
              size={16}
              className="size-8"
              onClick={() => open(reply.draftId)}
            />
            <IconButton
              icon="close"
              label={t.saveAndClose}
              className="size-8"
              onClick={() => void session.close()}
            />
          </header>
        )}
      />
    </div>
  );
}
