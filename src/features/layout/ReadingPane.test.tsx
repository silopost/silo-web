import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";
import { DEFAULT_PANE_SIZES, usePrefs, type ReadingPane } from "../../state/ui";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllGlobals();
  usePrefs.setState({ readingPane: "none", paneSizes: DEFAULT_PANE_SIZES });
});
afterAll(() => server.close());

function setup(url: string, mode: ReadingPane = "none") {
  usePrefs.setState({ readingPane: mode });
  const mail = createMockMail();
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

const row = (subject: string) => screen.findByRole("row", { name: new RegExp(subject) });
const placeholder = () => screen.queryByText("No conversation selected");

describe("usePrefs.readingPane", () => {
  it("defaults to none and persists the mode and the pane size locally", () => {
    expect(usePrefs.getState().readingPane).toBe("none");
    act(() => {
      usePrefs.getState().setReadingPane("vertical");
      usePrefs.getState().setPaneSize("vertical", 0.3);
    });
    const stored = JSON.parse(localStorage.getItem("silo.prefs") ?? "{}");
    expect(stored.state).toMatchObject({
      readingPane: "vertical",
      paneSizes: { vertical: 0.3, horizontal: DEFAULT_PANE_SIZES.horizontal },
    });
  });
});

describe("no split", () => {
  it("replaces the list with the open thread, as before", async () => {
    setup("/u/0/inbox/t_1");
    expect(await screen.findByRole("heading", { name: "Temat 1" })).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(placeholder()).toBeNull();
  });

  it("switches to a split from the toolbar menu without asking the server", async () => {
    const { mail, user } = setup("/u/0/inbox");
    await row("Temat 1");
    expect(placeholder()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reading pane" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Vertical split" }));
    expect(usePrefs.getState().readingPane).toBe("vertical");
    expect(await screen.findByText("No conversation selected")).toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(mail.state.calls.settings).toEqual([]);
  });
});

describe("vertical split", () => {
  it("shows the list with a placeholder, opens a row beside it and closes with u", async () => {
    const { user, router } = setup("/u/0/inbox", "vertical");
    await row("Temat 5");
    expect(placeholder()).toBeInTheDocument();
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");

    await user.click(await row("Temat 2"));
    expect(await screen.findByRole("heading", { name: "Temat 2" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/u/0/inbox/t_2");
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(placeholder()).toBeNull();

    // The focus is on the list: j / k move its cursor and do not change the open thread.
    await user.keyboard("j");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("row", { name: /Temat 3/ })),
    );
    expect(router.state.location.pathname).toBe("/u/0/inbox/t_2");

    // `u` is a thread key: it closes the pane, the list stays.
    await user.keyboard("u");
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/inbox"));
    expect(await screen.findByText("No conversation selected")).toBeInTheDocument();
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });

  it("resizes with the arrow keys of the divider and keeps the size", async () => {
    const { user } = setup("/u/0/inbox", "vertical");
    await row("Temat 1");
    const divider = screen.getByRole("separator", { name: "Resize reading pane" });
    expect(divider).toHaveAttribute("aria-valuenow", "40");
    divider.focus();
    await user.keyboard("{ArrowRight}");
    expect(divider).toHaveAttribute("aria-valuenow", "42");
    expect(usePrefs.getState().paneSizes.vertical).toBeCloseTo(0.42);
  });

  it("gives the keys to the thread while the focus is in its pane; Esc closes it", async () => {
    const { user, router } = setup("/u/0/inbox/t_1", "vertical");
    const heading = await screen.findByRole("heading", { name: "Temat 1" });
    await row("Temat 5");
    // A click on the thread's text focuses its pane.
    await user.click(heading);
    await user.keyboard("j");
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/inbox/t_2"));
    expect(await screen.findByRole("heading", { name: "Temat 2" })).toBeInTheDocument();

    await user.click(screen.getByRole("heading", { name: "Temat 2" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/inbox"));
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });
});

describe("horizontal split", () => {
  it("opens a deep link under the list", async () => {
    setup("/u/0/inbox/t_1", "horizontal");
    expect(await screen.findByRole("heading", { name: "Temat 1" })).toBeInTheDocument();
    expect(await row("Temat 3")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
  });

  it("applies to search results too", async () => {
    setup("/u/0/search?q=Temat", "horizontal");
    expect(await screen.findByRole("grid")).toBeInTheDocument();
    expect(placeholder()).toBeInTheDocument();
  });

  it("falls back to no split in a narrow window and keeps the preference", async () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    setup("/u/0/inbox/t_1", "horizontal");
    expect(await screen.findByRole("heading", { name: "Temat 1" })).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(usePrefs.getState().readingPane).toBe("horizontal");
  });
});

describe("general settings", () => {
  it("sets the reading pane locally, without a PATCH", async () => {
    const { mail, user } = setup("/u/0/settings/general");
    const group = await screen.findByRole("radiogroup", { name: "Reading pane" });
    expect(within(group).getByRole("radio", { name: "No split" })).toBeChecked();
    await user.click(within(group).getByRole("radio", { name: "Horizontal split" }));
    expect(usePrefs.getState().readingPane).toBe("horizontal");
    expect(mail.state.calls.settings).toEqual([]);
  });
});
