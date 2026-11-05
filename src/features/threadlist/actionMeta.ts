import type { ThreadAction } from "../../api/mutations/threads";
import type { IconName } from "../../components/Icon";
import { t } from "../../lib/i18n";

/** Icon and label of each thread action button. */
export const ACTION_META: Record<
  Exclude<ThreadAction, "labels">,
  { icon: IconName; label: string }
> = {
  archive: { icon: "archive", label: t.archive },
  inbox: { icon: "moveToInbox", label: t.moveToInbox },
  trash: { icon: "delete", label: t.trash },
  untrash: { icon: "moveToInbox", label: t.untrash },
  deleteForever: { icon: "delete", label: t.deleteForever },
  spam: { icon: "report", label: t.spam },
  notSpam: { icon: "moveToInbox", label: t.notSpam },
  read: { icon: "markRead", label: t.markRead },
  unread: { icon: "markUnread", label: t.markUnread },
  star: { icon: "star", label: t.star },
  unstar: { icon: "starBorder", label: t.unstar },
};
