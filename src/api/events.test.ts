import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { useConnection } from "../state/connection";
import { applyEvent, connectEvents, eventsConfig } from "./events";
import { keys } from "./keys";
import { labelsQuery } from "./queries/labels";
import type { Label } from "./types";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("falls back to /events/poll when SSE is unavailable and applies the events", async () => {
  const original = { ...eventsConfig };
  eventsConfig.createEventSource = () => null;
  eventsConfig.pollIntervalMs = 10;

  const afters: string[] = [];
  server.use(
    http.get("*/api/v1/events/poll", ({ request }) => {
      const after = new URL(request.url).searchParams.get("after") ?? "";
      afters.push(after);
      // The first poll (no position) skips the backlog; later ones deliver new events.
      if (after === "0")
        return HttpResponse.json({ events: [{ id: 7, type: "resync", data: {} }], nextAfter: 7 });
      return HttpResponse.json({
        events: [
          {
            id: 8,
            type: "label.counts",
            data: {
              accountId: "acc_1",
              labels: [{ id: "INBOX", threadsUnread: 4, threadsTotal: 9 }],
            },
          },
        ],
        nextAfter: 8,
      });
    }),
  );

  const qc = new QueryClient();
  const inbox = { id: "INBOX", threadsUnread: 1, threadsTotal: 2 } as Label;
  qc.setQueryData(keys.labels("acc_1"), { labels: [inbox] });
  const stop = connectEvents(qc);
  try {
    await waitFor(() =>
      expect(qc.getQueryData<{ labels: Label[] }>(keys.labels("acc_1"))?.labels[0]).toMatchObject({
        threadsUnread: 4,
        threadsTotal: 9,
      }),
    );
    expect(afters.slice(0, 2)).toEqual(["0", "7"]);
    expect(useConnection.getState().state).toBe("polling");
  } finally {
    stop();
    Object.assign(eventsConfig, original);
  }
});

it("closes the stream on stream.limit, polls, shows the banner and retries SSE after retryAfter", async () => {
  const original = { ...eventsConfig };
  const listeners = new Map<string, (ev: MessageEvent) => void>();
  const close = vi.fn();
  let created = 0;
  eventsConfig.createEventSource = () => {
    created += 1;
    return {
      addEventListener: (t: string, l: (ev: MessageEvent) => void) => listeners.set(t, l),
      close,
      onopen: null,
      onerror: null,
      readyState: 1,
    } as never;
  };
  eventsConfig.pollIntervalMs = 1_000_000;
  server.use(
    http.get("*/api/v1/events/poll", () => HttpResponse.json({ events: [], nextAfter: 1 })),
  );
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const stop = connectEvents(new QueryClient());
  try {
    expect(created).toBe(1);
    listeners.get("stream.limit")?.(
      new MessageEvent("stream.limit", { data: '{"retryAfter":30}' }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(useConnection.getState().tooManyStreams).toBe(true);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(created).toBe(1);
    expect(useConnection.getState().state).toBe("polling");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(created).toBe(2);
  } finally {
    stop();
    vi.useRealTimers();
    Object.assign(eventsConfig, original);
  }
});

it("fetches the labels again when label.counts names a label the cached list lacks", async () => {
  // A newly added account: GET /labels answered before discovery created INBOX.
  let calls = 0;
  server.use(
    http.get("*/api/v1/labels", () => {
      calls += 1;
      const labels =
        calls === 1 ? [] : [{ id: "INBOX", accountId: "acc_2", threadsUnread: 1, threadsTotal: 1 }];
      return HttpResponse.json({ labels });
    }),
  );
  const qc = new QueryClient();
  const observer = new QueryObserver(qc, labelsQuery("acc_2"));
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await waitFor(() => expect(qc.getQueryData(keys.labels("acc_2"))).toEqual({ labels: [] }));
    applyEvent(qc, "label.counts", {
      accountId: "acc_2",
      labels: [{ id: "INBOX", threadsUnread: 1, threadsTotal: 1 }],
    });
    await waitFor(() =>
      expect(qc.getQueryData<{ labels: Label[] }>(keys.labels("acc_2"))?.labels[0]).toMatchObject({
        id: "INBOX",
        threadsUnread: 1,
      }),
    );
    expect(calls).toBe(2);
  } finally {
    unsubscribe();
  }
});
