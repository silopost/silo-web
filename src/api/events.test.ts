import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { useConnection } from "../state/connection";
import { connectEvents, eventsConfig } from "./events";
import { keys } from "./keys";
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
