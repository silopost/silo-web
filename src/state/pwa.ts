import { create } from "zustand";

type Pwa = {
  /** A new service worker (new silo-web build) waits; `update` activates it and reloads. */
  needRefresh: boolean;
  update: () => void;
};

/** Service worker update state for the version banner (registerType "prompt"). */
export const usePwa = create<Pwa>()(() => ({ needRefresh: false, update: () => {} }));
