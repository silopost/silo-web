import { create } from "zustand";
import { t } from "../lib/i18n";

export type Toast = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  /** Epoch ms when the snackbar hides; the server's undoUntil for undoable operations. */
  hideAt: number;
  /** 429 rate_limited: a generic error of the same request does not replace it. */
  rateLimited?: boolean;
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
    set((s) =>
      // The request that was refused with 429 usually reports a generic error right after.
      s.current?.rateLimited && toast.message === t.genericError && Date.now() < s.current.hideAt
        ? s
        : {
            current: {
              ...toast,
              id: ++seq,
              hideAt: Math.max(hideAt ?? 0, Date.now() + DEFAULT_MS),
            },
          },
    ),
  dismiss: (id) => set((s) => (id === undefined || s.current?.id === id ? { current: null } : s)),
  setLastUndo: (lastUndo) => set({ lastUndo }),
}));

export const toast = (message: string) => useToasts.getState().show({ message });

/** 429 rate_limited of any request (plan 5.3): "Try again in N s" from Retry-After. */
export const showRateLimited = (seconds?: number) =>
  useToasts.getState().show({ message: t.rateLimitedToast(seconds), rateLimited: true });
