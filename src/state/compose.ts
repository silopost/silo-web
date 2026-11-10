import { create } from "zustand";

export type WindowMode = "normal" | "minimized" | "maximized";

/**
 * draftId changes when the draft moves to another account ("Od", PUT /drafts/{id} accountId);
 * key stays, so that the window is not mounted again.
 */
export type ComposeWindowState = { draftId: string; key: string; mode: WindowMode };

/**
 * A reply shown under a message of its thread instead of in the dock, as in Gmail. One at a time:
 * another reply in a thread saves and closes the previous one. threadId and anchorId (the message
 * it answers) tell ThreadView where to render it.
 */
export type InlineReplyState = {
  draftId: string;
  key: string;
  threadId: string;
  anchorId: string;
  mode: "reply" | "replyAll";
};

/** A failed send reported by outbound.status (plan 3.9 step 6), shown in the window's bar. */
export type SendFailure = { error?: string; failedRecipients?: string[] };

type Compose = {
  /** Open compose windows, oldest first (plan 6.4). */
  windows: ComposeWindowState[];
  inline: InlineReplyState | null;
  failures: Record<string, SendFailure>;
  /** Versions saved by other tabs or programs (draft.updated), per draft. */
  remoteVersions: Record<string, number>;
  open: (draftId: string, mode?: WindowMode) => void;
  /** Shows a draft as the inline reply of a thread. */
  openInline: (draftId: string, at: Omit<InlineReplyState, "draftId" | "key">) => void;
  close: (draftId: string) => void;
  setMode: (draftId: string, mode: WindowMode) => void;
  setFailure: (draftId: string, failure: SendFailure | null) => void;
  setRemoteVersion: (draftId: string, version: number) => void;
  /** The draft got new ids (moved to another account): the window and its state follow. */
  rename: (from: string, to: string) => void;
};

const rekey = <T>(map: Record<string, T>, from: string, to: string): Record<string, T> => {
  if (!(from in map)) return map;
  const { [from]: value, ...rest } = map;
  return { ...rest, [to]: value as T };
};

/** At most three windows are expanded (plan 6.3); older ones are minimised. */
const MAX_EXPANDED = 3;

export const useCompose = create<Compose>()((set) => ({
  windows: [],
  inline: null,
  failures: {},
  remoteVersions: {},
  open: (draftId, mode = "normal") =>
    set((s) => {
      const others = s.windows.filter((w) => w.draftId !== draftId);
      // "Open in a window" of an inline reply: the draft moves to the dock with its key.
      const fromInline = s.inline?.draftId === draftId ? s.inline : null;
      const key = s.windows.find((w) => w.draftId === draftId)?.key ?? fromInline?.key ?? draftId;
      const windows = [
        ...others.map((w) =>
          mode === "maximized" && w.mode === "maximized" ? { ...w, mode: "normal" as const } : w,
        ),
        { draftId, key, mode },
      ];
      let expanded = windows.filter((w) => w.mode !== "minimized").length;
      return {
        inline: fromInline ? null : s.inline,
        windows: windows.map((w) => {
          if (expanded > MAX_EXPANDED && w.mode !== "minimized" && w.draftId !== draftId) {
            expanded -= 1;
            return { ...w, mode: "minimized" as const };
          }
          return w;
        }),
      };
    }),
  openInline: (draftId, at) =>
    set((s) => ({
      // A draft is shown in one place only.
      windows: s.windows.filter((w) => w.draftId !== draftId),
      inline: { ...at, draftId, key: s.inline?.draftId === draftId ? s.inline.key : draftId },
    })),
  close: (draftId) =>
    set((s) => ({
      windows: s.windows.filter((w) => w.draftId !== draftId),
      inline: s.inline?.draftId === draftId ? null : s.inline,
    })),
  setMode: (draftId, mode) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.draftId === draftId
          ? { ...w, mode }
          : mode === "maximized" && w.mode === "maximized"
            ? { ...w, mode: "normal" }
            : w,
      ),
    })),
  setFailure: (draftId, failure) =>
    set((s) => {
      const failures = { ...s.failures };
      if (failure) failures[draftId] = failure;
      else delete failures[draftId];
      return { failures };
    }),
  setRemoteVersion: (draftId, version) =>
    set((s) => ({ remoteVersions: { ...s.remoteVersions, [draftId]: version } })),
  rename: (from, to) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.draftId === from ? { ...w, draftId: to } : w)),
      inline: s.inline?.draftId === from ? { ...s.inline, draftId: to } : s.inline,
      failures: rekey(s.failures, from, to),
      remoteVersions: rekey(s.remoteVersions, from, to),
    })),
}));
