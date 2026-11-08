import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eventsConfig } from "../../api/events";
import { keys } from "../../api/keys";
import { compareVersions } from "../../lib/semver";
import { useConnection } from "../../state/connection";
import { FakeEventSource } from "../../test/fakeEventSource";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";
import { versionConfig } from "./version";

/** Version banner (plan 2.4), SSE session.expired, stream.limit and 429 (limits of silo-server). */

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
const originalEvents = { ...eventsConfig };
const originalVersion = { ...versionConfig };
afterEach(() => {
  server.resetHandlers();
  Object.assign(eventsConfig, originalEvents);
  Object.assign(versionConfig, originalVersion);
});
afterAll(() => server.close());

type Mail = ReturnType<typeof createMockMail>;

function setup(url = "/u/0/inbox", prepare?: (mail: Mail) => void) {
  const mail = createMockMail();
  prepare?.(mail);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

describe("compareVersions", () => {
  it("compares major, minor and patch numerically", () => {
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.3.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
    expect(compareVersions("v0.4.1-rc.1", "0.4.1")).toBe(0);
    expect(compareVersions("0.4", "0.4.0")).toBe(0);
  });
});

describe("version banner", () => {
  it("asks for a reload when this silo-web is older than minWebVersion", async () => {
    let reloads = 0;
    versionConfig.appVersion = "0.3.0";
    versionConfig.reload = () => void (reloads += 1);
    const { user } = setup("/u/0/inbox", (m) => {
      m.state.minWebVersion = "0.4.0";
    });
    const banner = await screen.findByText("A new version is available");
    await user.click(within(banner.parentElement!).getByRole("button", { name: "Refresh" }));
    expect(reloads).toBe(1);
  });

  it("shows nothing for a supported version", async () => {
    versionConfig.appVersion = "0.3.0";
    setup();
    await screen.findByRole("grid");
    expect(screen.queryByText("A new version is available")).toBeNull();
    expect(screen.queryByText("The server was updated")).toBeNull();
  });

  it("tells about a server upgrade noticed after an SSE reconnect", async () => {
    const { mail } = setup();
    await screen.findByRole("grid");
    await waitFor(() => expect(mail.state.calls.meta).toBeGreaterThan(0));
    const before = mail.state.calls.meta;
    mail.state.serverVersion = "0.5.0";
    // The stream drops and comes back (the server restarted): GET /meta again.
    act(() => FakeEventSource.latest().onopen?.(new Event("open")));
    await waitFor(() => expect(mail.state.calls.meta).toBeGreaterThan(before));
    expect(await screen.findByText("The server was updated")).toBeInTheDocument();
  });
});

describe("session.expired", () => {
  it("drops the session and opens the login page with the way back", async () => {
    const { router, queryClient } = setup("/u/0/starred");
    await screen.findByRole("grid");
    act(() => FakeEventSource.latest().emit("session.expired", {}));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({ redirect: "/u/0/starred" });
    expect(queryClient.getQueryData(keys.session)).toBeUndefined();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("stream.limit", () => {
  it("does not reconnect in a loop when the user has too many streams: banner and polling", async () => {
    let polls = 0;
    eventsConfig.pollIntervalMs = 20;
    setup("/u/0/inbox", () => {
      server.use(
        http.get("*/api/v1/events/poll", () => {
          polls += 1;
          return HttpResponse.json({ events: [], nextAfter: 1 });
        }),
      );
    });
    await screen.findByRole("grid");
    const es = FakeEventSource.latest();
    act(() => es.emit("stream.limit", { retryAfter: 30 }));
    expect(es.readyState).toBe(2);
    expect(await screen.findByText(/Too many Silo tabs are open/)).toBeInTheDocument();
    await waitFor(() => expect(polls).toBeGreaterThan(2));
    expect(useConnection.getState()).toMatchObject({ state: "polling", tooManyStreams: true });
  });
});

describe("429", () => {
  it("shows Retry-After of rate_limited instead of the generic error", async () => {
    const { user } = setup();
    // After the fake's handlers, so that it wins.
    server.use(
      http.post("*/api/v1/threads/modify", () =>
        HttpResponse.json(
          { status: 429, code: "rate_limited", title: "Too Many Requests" },
          { status: 429, headers: { "Retry-After": "12" } },
        ),
      ),
    );
    const row = await screen.findByRole("row", { name: /Temat 2/ });
    await user.click(within(row).getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Too many requests. Try again in 12 s.")).toBeInTheDocument();
    // The rolled back row is back; the generic snackbar did not replace the 429 one.
    expect(await screen.findByRole("row", { name: /Temat 2/ })).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong. Try again.")).toBeNull();
  });
});
