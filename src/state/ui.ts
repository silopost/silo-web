import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "default" | "comfortable" | "compact";

/** Row height per density (plan 6.3); the virtualiser uses the same values as the CSS. */
export const ROW_HEIGHT: Record<Density, number> = { default: 40, comfortable: 40, compact: 32 };

type Prefs = {
  density: Density;
  navCollapsed: boolean;
  setDensity: (d: Density) => void;
  toggleNav: () => void;
};

/** Preferences kept in localStorage (plan 6.4). */
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      density: "default",
      navCollapsed: false,
      setDensity: (density) => set({ density }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
    }),
    { name: "silo.prefs", partialize: ({ density, navCollapsed }) => ({ density, navCollapsed }) },
  ),
);

type Ui = {
  /** Selected thread ids of the visible list. */
  selection: ReadonlySet<string>;
  /** Keyboard cursor of the list (j/k). */
  focusedThreadId: string | null;
  composeOpen: boolean;
  shortcutsHelpOpen: boolean;
  setSelection: (ids: Iterable<string>) => void;
  toggleSelected: (id: string) => void;
  setFocused: (id: string | null) => void;
  setComposeOpen: (open: boolean) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  /** First key of a sequence (`g`, `*`) waiting for the second one. */
  pendingPrefix: string | null;
  setPendingPrefix: (prefix: string | null) => void;
};

export const useUi = create<Ui>()((set) => ({
  selection: new Set(),
  focusedThreadId: null,
  composeOpen: false,
  shortcutsHelpOpen: false,
  setSelection: (ids) => set({ selection: new Set(ids) }),
  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selection);
      if (!next.delete(id)) next.add(id);
      return { selection: next };
    }),
  setFocused: (focusedThreadId) => set({ focusedThreadId }),
  setComposeOpen: (composeOpen) => set({ composeOpen }),
  setShortcutsHelpOpen: (shortcutsHelpOpen) => set({ shortcutsHelpOpen }),
  pendingPrefix: null,
  setPendingPrefix: (pendingPrefix) => set({ pendingPrefix }),
}));
