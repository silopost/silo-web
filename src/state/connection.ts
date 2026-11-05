import { create } from "zustand";

/**
 * Connection of this tab to silo-server: the SSE stream, its polling fallback, or nothing
 * (server unreachable → offline banner).
 */
export type ConnectionState = "connecting" | "live" | "polling" | "offline";

export const useConnection = create<{ state: ConnectionState }>()(() => ({ state: "connecting" }));

export const setConnection = (state: ConnectionState) => useConnection.setState({ state });
