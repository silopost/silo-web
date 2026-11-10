import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { FakeEventSource } from "../../test/fakeEventSource";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

type Mail = ReturnType<typeof createMockMail>;

/** dev1 (acc_1, 1 unread thread in the fake) and dev2 (acc_2, 4 unread). */
function setup(url = "/u/0/inbox", prepare?: (mail: Mail) => void) {
  const mail = createMockMail();
  mail.addAccount(2);
  mail.state.accountCounts.acc_2 = { INBOX: { unread: 4, total: 9 } };
  prepare?.(mail);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

const trigger = () => screen.findByRole("button", { name: /^Account: / });

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await trigger());
  return screen.findByRole("menu", { name: /^Account: / });
}

describe("AccountSwitcher", () => {
  it("lists every account with its own INBOX unread count and badges the others", async () => {
    const { mail, user } = setup();
    // The first render of the app in a test file is slow: wait longer than the default.
    expect(await screen.findByTestId("switcher-badge", {}, { timeout: 5000 })).toHaveTextContent(
      "4",
    );
    expect(await trigger()).toHaveAccessibleName(
      "Account: dev1@silo.test, 4 unread in other accounts",
    );
    // One GET /labels per account (['labels', accountId]).
    expect(new Set(mail.state.calls.labelsGet)).toEqual(new Set(["acc_1", "acc_2"]));

    const menu = await openMenu(user);
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((i) => i.getAttribute("aria-label"))).toEqual([
      "dev1@silo.test, 1 unread",
      "dev2@silo.test, 4 unread",
    ]);
    expect(items[0]).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitem", { name: /Add account/ })).toBeInTheDocument();
    expect(document.title).toBe("Inbox (1) – dev1@silo.test – Silo");
  });

  it("updates the count of the account named by label.counts, not only the active one", async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId("switcher-badge")).toHaveTextContent("4"));
    act(() =>
      FakeEventSource.latest().emit("label.counts", {
        accountId: "acc_2",
        labels: [{ id: "INBOX", threadsUnread: 7, threadsTotal: 12 }],
      }),
    );
    await waitFor(() => expect(screen.getByTestId("switcher-badge")).toHaveTextContent("7"));
    // The active account's title is untouched by another account's counts.
    expect(document.title).toBe("Inbox (1) – dev1@silo.test – Silo");
    act(() =>
      FakeEventSource.latest().emit("label.counts", {
        accountId: "acc_1",
        labels: [{ id: "INBOX", threadsUnread: 3, threadsTotal: 5 }],
      }),
    );
    await waitFor(() => expect(document.title).toBe("Inbox (3) – dev1@silo.test – Silo"));
  });

  it("switches to the chosen account keeping a system view and remembers it in the settings", async () => {
    const { mail, user, router } = setup("/u/0/starred");
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /^dev2@silo.test/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/1/starred"));
    await waitFor(() => expect(mail.state.calls.settings).toEqual([{ activeAccountId: "acc_2" }]));
    // Now dev2 is active: the badge shows dev1's unread thread.
    await waitFor(async () =>
      expect(await trigger()).toHaveAccessibleName(
        "Account: dev2@silo.test, 1 unread in other accounts",
      ),
    );
  });

  it("falls back to the inbox when the view is a user label of the old account", async () => {
    const { user, router } = setup("/u/0/l_praca", (mail) => {
      mail.state.extraLabels.push(mail.makeLabel("l_praca", "Praca"));
    });
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /^dev2@silo.test/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/1/inbox"));
  });

  it("works from the keyboard: arrows, Enter and Esc", async () => {
    const { user, router } = setup();
    (await trigger()).focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: /^Account: / });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(menu).not.toBeInTheDocument());
    await user.keyboard("{Enter}");
    await screen.findByRole("menu", { name: /^Account: / });
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("menuitemradio", { name: /^dev2@silo.test/ }).matches(":focus")).toBe(
        true,
      ),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/1/inbox"));
  });

  it("shows the sync problem of an account", async () => {
    const { user } = setup("/u/0/inbox", (mail) => {
      mail.session.accounts![1]!.state = "auth_failed";
    });
    const menu = await openMenu(user);
    expect(
      within(menu).getByRole("menuitemradio", { name: /^dev2@silo.test/ }),
    ).toHaveAccessibleName("dev2@silo.test, 4 unread, Can't sign in to the mailbox");
  });

  it("g 2 switches to the account with position 1 and remembers it", async () => {
    const { mail, user, router } = setup();
    await screen.findByRole("grid");
    await user.keyboard("g2");
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/1/inbox"));
    await waitFor(() => expect(mail.state.calls.settings).toEqual([{ activeAccountId: "acc_2" }]));
  });

  it("opens Dodaj konto in the account settings", async () => {
    const { user, router } = setup();
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: /Add account/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/settings/accounts"));
    expect(await screen.findByRole("dialog", { name: "Add account" })).toBeInTheDocument();
  });
});

describe("favicon badge", () => {
  const icon = () => document.querySelector('link[rel="icon"]')!.getAttribute("href")!;
  const badge = () => {
    const href = icon();
    if (!href.startsWith("data:")) return null;
    const svg = decodeURIComponent(href.slice(href.indexOf(",") + 1));
    return /<text[^>]*>([^<]*)<\/text>/.exec(svg)?.[1] ?? null;
  };
  afterEach(() => document.querySelector('link[rel="icon"]')?.remove());

  it("shows the unread count of the active Inbox, follows label.counts and the switch, and goes on sign-out", async () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      '<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">',
    );
    const { user, router } = setup();
    await waitFor(() => expect(badge()).toBe("1"), { timeout: 5000 });
    act(() =>
      FakeEventSource.latest().emit("label.counts", {
        accountId: "acc_1",
        labels: [{ id: "INBOX", threadsUnread: 120, threadsTotal: 200 }],
      }),
    );
    await waitFor(() => expect(badge()).toBe("99+"));
    act(() =>
      FakeEventSource.latest().emit("label.counts", {
        accountId: "acc_1",
        labels: [{ id: "INBOX", threadsUnread: 0, threadsTotal: 200 }],
      }),
    );
    await waitFor(() => expect(icon()).toBe("/icons/icon.svg"));

    let menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /^dev2@silo.test/ }));
    await waitFor(() => expect(badge()).toBe("4"));

    menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(icon()).toBe("/icons/icon.svg");
  });
});
