import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

type Mail = ReturnType<typeof createMockMail>;

function setup(url = "/u/0/inbox", prepare?: (mail: Mail) => void) {
  const mail = createMockMail();
  prepare?.(mail);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

const row = (subject: string) => screen.findByRole("row", { name: new RegExp(subject) });
const rowIds = () => screen.queryAllByRole("row").map((r) => r.getAttribute("data-thread-id"));
const TOMORROW = "2026-11-06T07:00:00Z";
const NEXT_WEEK = "2026-11-09T07:00:00Z";

/** A thread snoozed until the 10th of November. */
const snoozed = (mail: Mail) => {
  mail.state.threads.push({
    ...mail.state.threads[0]!,
    id: "t_6",
    subject: "Odłożony 6",
    labelIds: ["SNOOZED"],
    unreadCount: 0,
    snoozedUntil: "2026-11-10T07:00:00Z",
  });
};

it("snoozes a row with a server preset: optimistic, snackbar, Cofnij", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(within(await row("Temat 2")).getByRole("button", { name: "Snooze" }));

  const menu = await screen.findByRole("menu", { name: "Snooze until…" });
  // Labels translated by key; times are the server's `until`, only formatted.
  await within(menu).findByRole("menuitem", { name: /^Tomorrow/ });
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((i) => i.textContent),
  ).toEqual([
    expect.stringMatching(/^Later today/),
    expect.stringMatching(/^Tomorrow/),
    expect.stringMatching(/^This weekend/),
    expect.stringMatching(/^Next week/),
    "Pick date & time",
  ]);
  await user.click(within(menu).getByRole("menuitem", { name: /^Tomorrow/ }));

  await waitFor(() => expect(rowIds()).not.toContain("t_2"));
  expect(mail.state.calls.snooze).toEqual([{ id: "t_2", until: TOMORROW }]);
  const snackbar = await screen.findByText(/^Conversation snoozed until/);
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Undo" }));

  expect(await row("Temat 2")).toBeInTheDocument();
  expect(mail.state.calls.undo).toEqual(["op_1"]);
  await waitFor(() => expect(rowIds()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]));
});

it("b opens the snooze picker for the row under the cursor", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  // Without a cursor the first row is the cursor; j moves to the second.
  await user.keyboard("j");
  await user.keyboard("b");
  const menu = await screen.findByRole("menu", { name: "Snooze until…" });
  await user.click(await within(menu).findByRole("menuitem", { name: /Next week/ }));
  await waitFor(() => expect(mail.state.calls.snooze).toEqual([{ id: "t_2", until: NEXT_WEEK }]));
  await waitFor(() => expect(rowIds()).not.toContain("t_2"));
});

it("snoozes the selected threads from the toolbar; Cofnij undoes all of them", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  for (const s of ["Temat 3", "Temat 4"]) {
    await user.click(within(await row(s)).getByRole("checkbox"));
  }
  const toolbar = screen.getByRole("toolbar", { name: "Thread list" });
  await user.click(within(toolbar).getByRole("button", { name: "Snooze" }));
  await user.click(await screen.findByRole("menuitem", { name: /^Tomorrow/ }));

  await waitFor(() => expect(rowIds()).toEqual(["t_1", "t_2", "t_5"]));
  expect(mail.state.calls.snooze.map((c) => c.id).sort()).toEqual(["t_3", "t_4"]);
  const snackbar = await screen.findByText(/^2 conversations snoozed until/);
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Undo" }));
  await waitFor(() => expect(mail.state.calls.undo.sort()).toEqual(["op_1", "op_2"]));
  await waitFor(() => expect(rowIds()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]));
});

it("snoozes until a picked date and time, sent as RFC 3339", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(within(await row("Temat 1")).getByRole("button", { name: "Snooze" }));
  await user.click(await screen.findByRole("menuitem", { name: "Pick date & time" }));
  const dialog = await screen.findByRole("dialog", { name: "Snooze until…" });
  const field = within(dialog).getByLabelText("Date and time");
  expect(field).toHaveAttribute("min");
  fireEvent.change(field, { target: { value: "2026-12-01T09:30" } });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));

  await waitFor(() =>
    expect(mail.state.calls.snooze).toEqual([
      { id: "t_1", until: new Date("2026-12-01T09:30").toISOString() },
    ]),
  );
});

it("409 not_in_inbox rolls back and explains", async () => {
  const { mail, user } = setup("/u/0/all", (m) => {
    m.state.threads[2]!.labelIds = [];
  });
  await row("Temat 5");
  await user.click(within(await row("Temat 3")).getByRole("button", { name: "Snooze" }));
  await user.click(await screen.findByRole("menuitem", { name: /^Tomorrow/ }));
  expect(
    await screen.findByText("Only conversations in the Inbox can be snoozed."),
  ).toBeInTheDocument();
  expect(mail.state.calls.snooze).toEqual([{ id: "t_3", until: TOMORROW }]);
  expect(await row("Temat 3")).toBeInTheDocument();
});

it("lists snoozed threads with their wake time and wakes one now", async () => {
  const { mail, user } = setup("/u/0/snoozed", snoozed);
  const r = await row("Odłożony 6");
  expect(r).toHaveAttribute("aria-label", expect.stringContaining("Snoozed until Nov 10, 8:00 AM"));
  expect(within(r).getByText("Nov 10, 8:00 AM")).toBeInTheDocument();
  // LeftNav counter of Snoozed (threadsTotal from GET /labels).
  expect(screen.getByRole("link", { name: /Snoozed/ })).toHaveTextContent("1");
  expect(within(r).getByRole("button", { name: "Change time" })).toBeInTheDocument();

  await user.click(within(r).getByRole("button", { name: "Unsnooze" }));
  await waitFor(() => expect(rowIds()).toEqual([]));
  expect(mail.state.calls.unsnooze).toEqual(["t_6"]);
  expect(await screen.findByText("Conversation moved to Inbox")).toBeInTheDocument();
});

it("a snoozed thread shows its wake time; b in the thread view snoozes it again", async () => {
  const { mail, user, router } = setup("/u/0/snoozed/t_6", snoozed);
  expect(await screen.findByText(/^Snoozed until Nov 10, 2026, 8:00 AM/)).toBeInTheDocument();
  await screen.findByRole("heading", { name: "Odłożony 6" });
  await user.keyboard("b");
  await user.click(await screen.findByRole("menuitem", { name: /^Tomorrow/ }));
  await waitFor(() => expect(mail.state.calls.snooze).toEqual([{ id: "t_6", until: TOMORROW }]));
  // Back to the list, as after archive.
  await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/snoozed"));
});

it("thread.updated carries snoozedUntil into the cached rows", async () => {
  setup("/u/0/snoozed", snoozed);
  await row("Odłożony 6");
  act(() =>
    FakeEventSource.latest().emit("thread.updated", {
      threadId: "t_6",
      accountId: "acc_1",
      labelIds: ["SNOOZED"],
      unreadCount: 0,
      pendingSync: false,
      snoozedUntil: "2026-11-12T07:00:00Z",
    }),
  );
  expect(await screen.findByText("Nov 12, 8:00 AM")).toBeInTheDocument();
});

it("Zaplanowane lists scheduled messages; Anuluj wysyłkę reopens the draft", async () => {
  const { mail, user } = setup("/u/0/scheduled", (m) => {
    const draftId = m.addDraftThread(7, {
      to: [{ name: "", email: "dev2@silo.test" }],
    });
    const th = m.state.threads.find((x) => x.id === "t_7")!;
    th.labelIds = ["SCHEDULED"];
    th.scheduledAt = "2026-11-06T07:00:00Z";
    th.outboundId = "ob_9";
    m.state.outbound.set("ob_9", { draftId, status: "queued" });
  });
  const r = await row("Szkic 7");
  expect(r).toHaveAttribute("aria-label", expect.stringContaining("Scheduled for Nov 6, 8:00 AM"));
  expect(screen.getByRole("link", { name: /Scheduled/ })).toHaveTextContent("1");

  await user.click(within(r).getByRole("button", { name: "Cancel send" }));
  const win = await screen.findByRole("dialog", { name: "Szkic 7" });
  expect(within(win).getByText("dev2@silo.test")).toBeInTheDocument();
  expect(mail.state.calls.cancel).toEqual(["ob_9"]);
  expect(await screen.findByText("Send cancelled")).toBeInTheDocument();
});

it("schedules a send from compose with a server time; Cofnij cancels it", async () => {
  const { mail, user } = setup();
  await screen.findByRole("grid");
  await user.keyboard("c");
  const win = await screen.findByRole("dialog", { name: "New message" });
  await user.type(within(win).getByRole("combobox", { name: "To" }), "dev2@silo.test,");
  await user.type(within(win).getByRole("textbox", { name: "Subject" }), "Plan");
  await user.click(within(win).getByRole("button", { name: "More send options" }));

  const menu = await screen.findByRole("menu", { name: "Schedule send" });
  await within(menu).findByRole("menuitem", { name: /Tomorrow morning/ });
  // Only the presets that make sense for sending; no time is computed in the browser.
  expect(within(menu).queryByRole("menuitem", { name: /Later today/ })).toBeNull();
  expect(within(menu).getByRole("menuitem", { name: /Monday morning/ })).toBeInTheDocument();
  await user.click(within(menu).getByRole("menuitem", { name: /Tomorrow morning/ }));

  await waitFor(() => expect(mail.state.calls.sendAt).toEqual([TOMORROW]));
  const snackbar = await screen.findByText(/^Send scheduled for/);
  expect(screen.queryByRole("dialog", { name: "Plan" })).toBeNull();
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Undo" }));
  expect(await screen.findByRole("dialog", { name: "Plan" })).toBeInTheDocument();
  expect(mail.state.calls.cancel).toEqual(["ob_1"]);
});
