import { create } from "zustand";

export type WindowMode = "normal" | "minimized" | "maximized";

export type ComposeWindowState = { draftId: string; mode: WindowMode };

/** A failed send reported by outbound.status (plan 3.9 step 6), shown in the window's bar. */
export type SendFailure = { error?: string; failedRecipients?: string[] };

type Compose = {
  /** Open compose windows, oldest first (plan 6.4). */
  windows: ComposeWindowState[];
  failures: Record<string, SendFailure>;
  /** Versions saved by other tabs or programs (draft.updated), per draft. */
  remoteVersions: Record<string, number>;
  open: (draftId: string, mode?: WindowMode) => void;
  close: (draftId: string) => void;
  setMode: (draftId: string, mode: WindowMode) => void;
  setFailure: (draftId: string, failure: SendFailure | null) => void;
  setRemoteVersion: (draftId: string, version: number) => void;
};

/** At most three windows are expanded (plan 6.3); older ones are minimised. */
const MAX_EXPANDED = 3;

export const useCompose = create<Compose>()((set) => ({
  windows: [],
  failures: {},
  remoteVersions: {},
  open: (draftId, mode = "normal") =>
    set((s) => {
      const others = s.windows.filter((w) => w.draftId !== draftId);
      const windows = [
        ...others.map((w) =>
          mode === "maximized" && w.mode === "maximized" ? { ...w, mode: "normal" as const } : w,
        ),
        { draftId, mode },
      ];
      let expanded = windows.filter((w) => w.mode !== "minimized").length;
      return {
        windows: windows.map((w) => {
          if (expanded > MAX_EXPANDED && w.mode !== "minimized" && w.draftId !== draftId) {
            expanded -= 1;
            return { ...w, mode: "minimized" as const };
          }
          return w;
        }),
      };
    }),
  close: (draftId) => set((s) => ({ windows: s.windows.filter((w) => w.draftId !== draftId) })),
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
}));
