import type { ThreadAction } from "../../api/mutations/threads";
import type { IconName } from "../../components/Icon";
import { t } from "../../lib/i18n";

/** Icon and label of each thread action button. */
export const ACTION_META: Record<
  Exclude<ThreadAction, "labels">,
  { icon: IconName; label: string }
> = {
  archive: {
    icon: "archive",
    get label() {
      return t.archive;
    },
  },
  inbox: {
    icon: "moveToInbox",
    get label() {
      return t.moveToInbox;
    },
  },
  trash: {
    icon: "delete",
    get label() {
      return t.trash;
    },
  },
  untrash: {
    icon: "moveToInbox",
    get label() {
      return t.untrash;
    },
  },
  deleteForever: {
    icon: "delete",
    get label() {
      return t.deleteForever;
    },
  },
  spam: {
    icon: "report",
    get label() {
      return t.spam;
    },
  },
  notSpam: {
    icon: "moveToInbox",
    get label() {
      return t.notSpam;
    },
  },
  read: {
    icon: "markRead",
    get label() {
      return t.markRead;
    },
  },
  unread: {
    icon: "markUnread",
    get label() {
      return t.markUnread;
    },
  },
  star: {
    icon: "star",
    get label() {
      return t.star;
    },
  },
  unstar: {
    icon: "starBorder",
    get label() {
      return t.unstar;
    },
  },
};
