import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "default" | "comfortable" | "compact";

/** Row height per density (plan 6.3); the virtualiser uses the same values as the CSS. */
export const ROW_HEIGHT: Record<Density, number> = { default: 40, comfortable: 40, compact: 32 };

/** Reading pane of the thread lists (Gmail "Reading pane"): none, list | thread, list / thread. */
export type ReadingPane = "none" | "vertical" | "horizontal";
export const READING_PANES: ReadingPane[] = ["none", "vertical", "horizontal"];

/** Share of the split taken by the list (0..1), per split direction. */
export type PaneSizes = { vertical: number; horizontal: number };
export const DEFAULT_PANE_SIZES: PaneSizes = { vertical: 0.4, horizontal: 0.5 };

type Prefs = {
  density: Density;
  navCollapsed: boolean;
  readingPane: ReadingPane;
  paneSizes: PaneSizes;
  setDensity: (d: Density) => void;
  toggleNav: () => void;
  setReadingPane: (mode: ReadingPane) => void;
  setPaneSize: (split: Exclude<ReadingPane, "none">, size: number) => void;
};

/** Preferences kept in localStorage (plan 6.4). */
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      density: "default",
      navCollapsed: false,
      readingPane: "none",
      paneSizes: DEFAULT_PANE_SIZES,
      setDensity: (density) => set({ density }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      setReadingPane: (readingPane) => set({ readingPane }),
      setPaneSize: (split, size) => set((s) => ({ paneSizes: { ...s.paneSizes, [split]: size } })),
    }),
    {
      name: "silo.prefs",
      // Local only: the reading pane is a preference of this browser, not a server setting.
      partialize: ({ density, navCollapsed, readingPane, paneSizes }) => ({
        density,
        navCollapsed,
        readingPane,
        paneSizes,
      }),
    },
  ),
);

type Ui = {
  /** Selected thread ids of the visible list. */
  selection: ReadonlySet<string>;
  /** Keyboard cursor of the list (j/k). */
  focusedThreadId: string | null;
  shortcutsHelpOpen: boolean;
  setSelection: (ids: Iterable<string>) => void;
  toggleSelected: (id: string) => void;
  setFocused: (id: string | null) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  /** First key of a sequence (`g`, `*`) waiting for the second one. */
  pendingPrefix: string | null;
  setPendingPrefix: (prefix: string | null) => void;
  /** The `g l` picker of labels and folders. */
  labelPickerOpen: boolean;
  setLabelPickerOpen: (open: boolean) => void;
};

export const useUi = create<Ui>()((set) => ({
  selection: new Set(),
  focusedThreadId: null,
  shortcutsHelpOpen: false,
  setSelection: (ids) => set({ selection: new Set(ids) }),
  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selection);
      if (!next.delete(id)) next.add(id);
      return { selection: next };
    }),
  setFocused: (focusedThreadId) => set({ focusedThreadId }),
  setShortcutsHelpOpen: (shortcutsHelpOpen) => set({ shortcutsHelpOpen }),
  pendingPrefix: null,
  setPendingPrefix: (pendingPrefix) => set({ pendingPrefix }),
  labelPickerOpen: false,
  setLabelPickerOpen: (labelPickerOpen) => set({ labelPickerOpen }),
}));
