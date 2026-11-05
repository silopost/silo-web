import { create } from "zustand";

export type Toast = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  /** Epoch ms when the snackbar hides; the server's undoUntil for undoable operations. */
  hideAt: number;
};

type Toasts = {
  current: Toast | null;
  /** Undo of the last undoable action, for the `z` shortcut; kept after the snackbar hides. */
  lastUndo: (() => void) | null;
  show: (toast: Omit<Toast, "id" | "hideAt"> & { hideAt?: number }) => void;
  dismiss: (id?: number) => void;
  setLastUndo: (undo: (() => void) | null) => void;
};

const DEFAULT_MS = 6000;
let seq = 0;

/** Snackbar state (plan 6.3): one snackbar at a time, the newest wins. */
export const useToasts = create<Toasts>()((set) => ({
  current: null,
  lastUndo: null,
  show: ({ hideAt, ...toast }) =>
    set({
      current: { ...toast, id: ++seq, hideAt: Math.max(hideAt ?? 0, Date.now() + DEFAULT_MS) },
    }),
  dismiss: (id) => set((s) => (id === undefined || s.current?.id === id ? { current: null } : s)),
  setLastUndo: (lastUndo) => set({ lastUndo }),
}));

export const toast = (message: string) => useToasts.getState().show({ message });
