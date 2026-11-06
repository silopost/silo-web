import { create } from "zustand";

/**
 * Connection of this tab to silo-server: the SSE stream, its polling fallback, or nothing
 * (server unreachable → offline banner).
 */
export type ConnectionState = "connecting" | "live" | "polling" | "offline";

type Connection = {
  state: ConnectionState;
  /** GET /events answered 429: the user has too many streams (tabs) open; this tab polls. */
  tooManyStreams: boolean;
};

export const useConnection = create<Connection>()(() => ({
  state: "connecting",
  tooManyStreams: false,
}));

export const setConnection = (state: ConnectionState) => useConnection.setState({ state });

export const setTooManyStreams = (tooManyStreams: boolean) =>
  useConnection.setState({ tooManyStreams });
