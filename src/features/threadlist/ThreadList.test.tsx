import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { FakeEventSource } from "../../test/fakeEventSource";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
  const mail = createMockMail();
  server.use(...mail.handlers);
  const user = userEvent.setup();
  const app = renderApp("/u/0/inbox");
  return { mail, user, ...app };
}

const row = (subject: string) => screen.findByRole("row", { name: new RegExp(subject) });
const rowNames = () => screen.getAllByRole("row").map((r) => r.getAttribute("data-thread-id"));

it("renders the inbox and loads the next page by cursor", async () => {
  const { mail } = setup();
  const first = await row("Temat 1");
  expect(first).toHaveAttribute("aria-label", expect.stringContaining("Unread"));
  // Page 1 has 3 rows; the viewport is taller, so page 2 (cursor "3") follows.
  expect(await row("Temat 5")).toBeInTheDocument();
  expect(mail.state.calls.threadPages).toEqual([null, "3"]);
  expect(rowNames()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]);
  expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "5");
  // LeftNav counter from GET /labels.
  expect(screen.getByRole("link", { name: /Inbox/ })).toHaveTextContent("1");
});

it("archives optimistically and restores the row on Cofnij", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(within(await row("Temat 2")).getByRole("button", { name: "Archive" }));

  await waitFor(() => expect(screen.queryByRole("row", { name: /Temat 2/ })).toBeNull());
  expect(mail.state.calls.modify).toEqual([
    { ids: ["t_2"], addLabelIds: [], removeLabelIds: ["INBOX"] },
  ]);
  const snackbar = await screen.findByText("Conversation archived");
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Undo" }));

  expect(await row("Temat 2")).toBeInTheDocument();
  expect(mail.state.calls.undo).toEqual(["op_1"]);
  await waitFor(() => expect(rowNames()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]));
});

it("rolls back when the request fails", async () => {
  const { mail, user } = setup();
  mail.state.failModify = true;
  await row("Temat 5");
  await user.click(within(await row("Temat 3")).getByRole("button", { name: "Archive" }));

  expect(await screen.findByText("Something went wrong. Try again.")).toBeInTheDocument();
  expect(await row("Temat 3")).toBeInTheDocument();
  expect(rowNames()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]);
});

it("rolls back on operation.failed from the event stream", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(within(await row("Temat 4")).getByRole("button", { name: "Archive" }));
  await screen.findByText("Conversation archived");
  expect(screen.queryByRole("row", { name: /Temat 4/ })).toBeNull();

  // The write-back gave up: the server restored its state and reports it.
  mail.revert("op_1");
  act(() =>
    FakeEventSource.latest().emit("operation.failed", {
      operationId: "op_1",
      accountId: "acc_1",
      kind: "move",
      reason: "imap",
      threadIds: ["t_4"],
    }),
  );

  expect(await row("Temat 4")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Couldn't move 1 conversation on the mail server – restored the server's state",
    ),
  ).toBeInTheDocument();
});

it("selects rows with SelectMenu and acts on the selection", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(screen.getByRole("button", { name: "Selection options" }));
  await user.click(await screen.findByRole("menuitem", { name: "Starred" }));

  expect(screen.getByRole("row", { name: /Temat 2/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("row", { name: /Temat 1/ })).toHaveAttribute("aria-selected", "false");

  await user.click(screen.getByRole("button", { name: "Selection options" }));
  await user.click(await screen.findByRole("menuitem", { name: "All" }));
  expect(screen.getAllByRole("row").every((r) => r.getAttribute("aria-selected") === "true")).toBe(
    true,
  );

  const toolbar = screen.getByRole("toolbar");
  await user.click(within(toolbar).getByRole("button", { name: "Mark as read" }));
  await waitFor(() => expect(mail.state.calls.modify).toHaveLength(1));
  expect(mail.state.calls.modify[0]).toMatchObject({
    ids: ["t_1", "t_2", "t_3", "t_4", "t_5"],
    removeLabelIds: ["UNREAD"],
  });
  expect(await screen.findByText("5 conversations marked as read")).toBeInTheDocument();
});

it("moves with j/k, archives with e and undoes with z", async () => {
  const { mail, user } = setup();
  await row("Temat 5");

  // The first row is the cursor before any key (Gmail): j goes to the second one.
  expect(screen.getByRole("row", { name: /Temat 1/ })).toHaveAttribute("tabindex", "0");
  await user.keyboard("j");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("row", { name: /Temat 2/ })),
  );
  await user.keyboard("j");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("row", { name: /Temat 3/ })),
  );
  await user.keyboard("k");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("row", { name: /Temat 2/ })),
  );

  await user.keyboard("e");
  await waitFor(() => expect(screen.queryByRole("row", { name: /Temat 2/ })).toBeNull());
  expect(mail.state.calls.modify[0]).toMatchObject({ ids: ["t_2"], removeLabelIds: ["INBOX"] });
  await screen.findByText("Conversation archived");

  await user.keyboard("z");
  expect(await row("Temat 2")).toBeInTheDocument();
  expect(mail.state.calls.undo).toEqual(["op_1"]);
});

it("ignores shortcuts while typing in the search box", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(screen.getByRole("combobox", { name: "Search mail" }));
  await user.keyboard("je");
  expect(mail.state.calls.modify).toEqual([]);
  expect(screen.getByRole("combobox", { name: "Search mail" })).toHaveValue("je");
});

it("right click opens the row menu, acts on that row only and keeps the selection", async () => {
  const { mail, user, router } = setup();
  await row("Temat 5");
  // Temat 2 is selected; the menu of Temat 3 acts on Temat 3 alone.
  await user.click(
    within(await row("Temat 2")).getByRole("checkbox", { name: "Select conversation" }),
  );
  const target = await row("Temat 3");
  const shown = !target.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 60 }),
  );
  // The browser menu is replaced on rows only.
  expect(shown).toBe(true);
  const menu = await screen.findByRole("menu", { name: "Conversation actions" });
  expect(within(menu).getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
  expect(within(menu).getByRole("menuitem", { name: "Snooze" })).toBeInTheDocument();
  // Right click does not open the thread nor change the selection.
  expect(router.state.location.pathname).toBe("/u/0/inbox");
  expect(screen.getByRole("row", { name: /Temat 2/ })).toHaveAttribute("aria-selected", "true");
  expect(target).toHaveAttribute("aria-selected", "false");

  await user.click(within(menu).getByRole("menuitem", { name: "Archive" }));
  await waitFor(() => expect(screen.queryByRole("row", { name: /Temat 3/ })).toBeNull());
  expect(mail.state.calls.modify).toEqual([
    { ids: ["t_3"], addLabelIds: [], removeLabelIds: ["INBOX"] },
  ]);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("row", { name: /Temat 2/ })).toHaveAttribute("aria-selected", "true");
});

it("right click on a selected row acts on the whole selection, with the keyboard", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(
    within(await row("Temat 1")).getByRole("checkbox", { name: "Select conversation" }),
  );
  await user.click(
    within(await row("Temat 4")).getByRole("checkbox", { name: "Select conversation" }),
  );
  await user.pointer({ keys: "[MouseRight]", target: await row("Temat 4") });
  const menu = await screen.findByRole("menu", { name: "Conversation actions" });
  // Temat 1 is unread, so the menu offers "Mark as read".
  await user.keyboard("{ArrowDown}");
  await waitFor(() =>
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveAttribute("data-highlighted"),
  );
  const read = within(menu).getByRole("menuitem", { name: "Mark as read" });
  read.focus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(mail.state.calls.modify).toHaveLength(1));
  expect(mail.state.calls.modify[0]).toMatchObject({
    ids: ["t_1", "t_4"],
    removeLabelIds: ["UNREAD"],
  });
  expect(screen.queryByRole("menu")).toBeNull();
});

it("Escape and scrolling close the row menu without acting", async () => {
  const { mail, user, router } = setup();
  await row("Temat 5");
  await user.pointer({ keys: "[MouseRight]", target: await row("Temat 2") });
  await screen.findByRole("menu", { name: "Conversation actions" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

  await user.pointer({ keys: "[MouseRight]", target: await row("Temat 2") });
  await screen.findByRole("menu", { name: "Conversation actions" });
  act(() => {
    screen.getByRole("grid").parentElement!.dispatchEvent(new Event("scroll"));
  });
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  expect(mail.state.calls.modify).toEqual([]);
  expect(router.state.location.pathname).toBe("/u/0/inbox");
});

const rightClick = async (user: ReturnType<typeof userEvent.setup>, subject: string) => {
  await user.pointer({ keys: "[MouseRight]", target: await row(subject) });
  return screen.findByRole("menu", { name: "Conversation actions" });
};

/**
 * Opens a submenu with ArrowRight. (A click on the trigger opens it too, but jsdom has no
 * layout, so Radix's pointer grace area fails and the next pointer move closes it.)
 */
const openSub = async (
  user: ReturnType<typeof userEvent.setup>,
  menu: HTMLElement,
  name: string,
) => {
  within(menu).getByRole("menuitem", { name }).focus();
  await user.keyboard("{ArrowRight}");
};

it("the row menu's Move to submenu moves like the toolbar, with undo", async () => {
  const { mail, user } = setup();
  mail.state.extraLabels.push(
    mail.makeLabel("l_f1", "Projekty", { type: "folder", folderId: "f_2", keywordState: null }),
  );
  await row("Temat 5");
  const menu = await rightClick(user, "Temat 3");
  // ArrowRight on the trigger opens the submenu (Radix), with the toolbar's targets.
  await openSub(user, menu, "Move to");
  const sub = await screen.findByRole("menu", { name: "Move to" });
  expect(
    within(sub)
      .getAllByRole("menuitem")
      .map((i) => i.textContent),
  ).toEqual(["Inbox", "Archive", "Spam", "Trash", "Projekty"]);
  await user.click(within(sub).getByRole("menuitem", { name: "Projekty" }));
  await waitFor(() =>
    expect(mail.state.calls.modify).toEqual([
      { ids: ["t_3"], addLabelIds: ["l_f1"], removeLabelIds: ["INBOX"] },
    ]),
  );
  expect(screen.queryByRole("menu")).toBeNull();
  await waitFor(() => expect(screen.queryByRole("row", { name: /Temat 3/ })).toBeNull());
  await user.click(await screen.findByRole("button", { name: "Undo" }));
  expect(await row("Temat 3")).toBeInTheDocument();
  expect(mail.state.calls.undo).toEqual(["op_1"]);
});

it("the row menu's Label as submenu shows the labels of the selection and toggles one", async () => {
  const { mail, user } = setup();
  mail.state.extraLabels.push(mail.makeLabel("l_u1", "Praca"), mail.makeLabel("l_u2", "Dom"));
  mail.state.threads.find((th) => th.id === "t_2")!.labelIds!.push("l_u1");
  await row("Temat 5");
  for (const s of ["Temat 1", "Temat 2"]) {
    await user.click(within(await row(s)).getByRole("checkbox", { name: "Select conversation" }));
  }
  const menu = await rightClick(user, "Temat 2");
  await openSub(user, menu, "Label as");
  const sub = await screen.findByRole("menu", { name: "Label as" });
  expect(within(sub).getByRole("menuitemcheckbox", { name: "Praca" })).toHaveAttribute(
    "aria-checked",
    "mixed",
  );
  expect(within(sub).getByRole("menuitemcheckbox", { name: "Dom" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  // A mixed label is added to all; the pick closes the menu and keeps the selection.
  await user.click(within(sub).getByRole("menuitemcheckbox", { name: "Praca" }));
  await waitFor(() =>
    expect(mail.state.calls.modify).toEqual([
      { ids: ["t_1", "t_2"], addLabelIds: ["l_u1"], removeLabelIds: [] },
    ]),
  );
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("row", { name: /Temat 1/ })).toHaveAttribute("aria-selected", "true");

  // Now on both: checked, and a click removes it from the row alone.
  const again = await rightClick(user, "Temat 3");
  await openSub(user, again, "Label as");
  const sub2 = await screen.findByRole("menu", { name: "Label as" });
  expect(within(sub2).getByRole("menuitemcheckbox", { name: "Praca" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await user.click(within(sub2).getByRole("menuitemcheckbox", { name: "Praca" }));
  await waitFor(() => expect(mail.state.calls.modify).toHaveLength(2));
  expect(mail.state.calls.modify[1]).toEqual({
    ids: ["t_3"],
    addLabelIds: ["l_u1"],
    removeLabelIds: [],
  });
});

it("the row menu says there are no labels and scrolling a submenu keeps it open", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  const menu = await rightClick(user, "Temat 2");
  await openSub(user, menu, "Label as");
  const sub = await screen.findByRole("menu", { name: "Label as" });
  expect(within(sub).getByRole("menuitem", { name: "No labels" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  act(() => {
    sub.dispatchEvent(new Event("scroll"));
  });
  expect(screen.getByRole("menu", { name: "Label as" })).toBeInTheDocument();
  expect(mail.state.calls.modify).toEqual([]);
});

/** Inbox whose t_1 has no draft, t_2 one and t_3 two (Thread.draftCount). */
function withDrafts(language: "en" | "pl") {
  const mail = createMockMail();
  mail.session.settings.language = language;
  for (const [id, n] of [
    ["t_2", 1],
    ["t_3", 2],
  ] as const) {
    const th = mail.state.threads.find((x) => x.id === id)!;
    th.draftCount = n;
    th.draftId = `d_${id}`;
  }
  server.use(...mail.handlers);
  renderApp("/u/0/inbox");
  return mail;
}

it.each([
  ["en", "Draft", "Drafts (2)"],
  ["pl", "Wersja robocza", "Wersje robocze (2)"],
] as const)("marks threads with drafts in red after the senders (%s)", async (lang, one, two) => {
  withDrafts(lang);
  const r1 = await row("Temat 1");
  const r2 = await row("Temat 2");
  const r3 = await row("Temat 3");
  for (const marker of [one, two]) expect(within(r1).queryByText(marker)).toBeNull();
  const m1 = within(r2).getByText(one);
  expect(m1).toHaveClass("text-error-ink");
  // In the cell of the senders, after the names; read out as part of the row.
  expect(m1.closest('[role="gridcell"]')).toHaveTextContent(new RegExp(`Osoba 2.*${one}$`));
  expect(r2).toHaveAttribute("aria-label", expect.stringContaining(`Osoba 2, ${one}, Temat 2`));
  expect(within(r3).getByText(two)).toHaveClass("text-error-ink");
  expect(r3).toHaveAttribute("aria-label", expect.stringContaining(two));
  expect(r1.getAttribute("aria-label")).not.toContain(one);
});

it("thread.updated adds and removes the draft marker without a refetch", async () => {
  const mail = withDrafts("en");
  const r1 = await row("Temat 1");
  const pages = mail.state.calls.threadPages.length;
  const update = (draftCount: number) =>
    act(() =>
      FakeEventSource.latest().emit("thread.updated", {
        threadId: "t_1",
        accountId: "acc_1",
        labelIds: draftCount ? ["INBOX", "DRAFT", "UNREAD"] : ["INBOX", "UNREAD"],
        unreadCount: 1,
        pendingSync: false,
        draftId: draftCount ? "d_x" : null,
        draftCount,
      }),
    );
  update(1);
  expect(await within(r1).findByText("Draft")).toBeInTheDocument();
  update(3);
  expect(await within(r1).findByText("Drafts (3)")).toBeInTheDocument();
  update(0);
  await waitFor(() => expect(within(r1).queryByText(/^Drafts?\b/)).toBeNull());
  expect(mail.state.calls.threadPages.length).toBe(pages);
});
