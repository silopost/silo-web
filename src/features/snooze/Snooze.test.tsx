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
  await user.click(within(await row("Temat 2")).getByRole("button", { name: "Odłóż" }));

  const menu = await screen.findByRole("menu", { name: "Odłóż do…" });
  // Labels translated by key; times are the server's `until`, only formatted.
  await within(menu).findByRole("menuitem", { name: /^Jutro/ });
  expect(
    within(menu)
      .getAllByRole("menuitem")
      .map((i) => i.textContent),
  ).toEqual([
    expect.stringMatching(/^Później dziś/),
    expect.stringMatching(/^Jutro/),
    expect.stringMatching(/^W ten weekend/),
    expect.stringMatching(/^W przyszłym tygodniu/),
    "Wybierz datę i godzinę",
  ]);
  await user.click(within(menu).getByRole("menuitem", { name: /^Jutro/ }));

  await waitFor(() => expect(rowIds()).not.toContain("t_2"));
  expect(mail.state.calls.snooze).toEqual([{ id: "t_2", until: TOMORROW }]);
  const snackbar = await screen.findByText(/^Wątek odłożony do/);
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Cofnij" }));

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
  const menu = await screen.findByRole("menu", { name: "Odłóż do…" });
  await user.click(await within(menu).findByRole("menuitem", { name: /W przyszłym tygodniu/ }));
  await waitFor(() => expect(mail.state.calls.snooze).toEqual([{ id: "t_2", until: NEXT_WEEK }]));
  await waitFor(() => expect(rowIds()).not.toContain("t_2"));
});

it("snoozes the selected threads from the toolbar; Cofnij undoes all of them", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  for (const s of ["Temat 3", "Temat 4"]) {
    await user.click(within(await row(s)).getByRole("checkbox"));
  }
  const toolbar = screen.getByRole("toolbar", { name: "Lista wątków" });
  await user.click(within(toolbar).getByRole("button", { name: "Odłóż" }));
  await user.click(await screen.findByRole("menuitem", { name: /^Jutro/ }));

  await waitFor(() => expect(rowIds()).toEqual(["t_1", "t_2", "t_5"]));
  expect(mail.state.calls.snooze.map((c) => c.id).sort()).toEqual(["t_3", "t_4"]);
  const snackbar = await screen.findByText(/^Odłożono 2 wątki do/);
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Cofnij" }));
  await waitFor(() => expect(mail.state.calls.undo.sort()).toEqual(["op_1", "op_2"]));
  await waitFor(() => expect(rowIds()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]));
});

it("snoozes until a picked date and time, sent as RFC 3339", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(within(await row("Temat 1")).getByRole("button", { name: "Odłóż" }));
  await user.click(await screen.findByRole("menuitem", { name: "Wybierz datę i godzinę" }));
  const dialog = await screen.findByRole("dialog", { name: "Odłóż do…" });
  const field = within(dialog).getByLabelText("Data i godzina");
  expect(field).toHaveAttribute("min");
  fireEvent.change(field, { target: { value: "2026-12-01T09:30" } });
  await user.click(within(dialog).getByRole("button", { name: "Zapisz" }));

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
  await user.click(within(await row("Temat 3")).getByRole("button", { name: "Odłóż" }));
  await user.click(await screen.findByRole("menuitem", { name: /^Jutro/ }));
  expect(await screen.findByText("Odłożyć można tylko wątki z Odebranych.")).toBeInTheDocument();
  expect(mail.state.calls.snooze).toEqual([{ id: "t_3", until: TOMORROW }]);
  expect(await row("Temat 3")).toBeInTheDocument();
});

it("lists snoozed threads with their wake time and wakes one now", async () => {
  const { mail, user } = setup("/u/0/snoozed", snoozed);
  const r = await row("Odłożony 6");
  expect(r).toHaveAttribute("aria-label", expect.stringContaining("Odłożone do 10 lis, 08:00"));
  expect(within(r).getByText("10 lis, 08:00")).toBeInTheDocument();
  // LeftNav counter of Snoozed (threadsTotal from GET /labels).
  expect(screen.getByRole("link", { name: /Odłożone/ })).toHaveTextContent("1");
  expect(within(r).getByRole("button", { name: "Zmień termin" })).toBeInTheDocument();

  await user.click(within(r).getByRole("button", { name: "Wybudź teraz" }));
  await waitFor(() => expect(rowIds()).toEqual([]));
  expect(mail.state.calls.unsnooze).toEqual(["t_6"]);
  expect(await screen.findByText("Wątek przeniesiony do Odebranych")).toBeInTheDocument();
});

it("a snoozed thread shows its wake time; b in the thread view snoozes it again", async () => {
  const { mail, user, router } = setup("/u/0/snoozed/t_6", snoozed);
  expect(await screen.findByText(/^Odłożone do 10 lis 2026, 08:00/)).toBeInTheDocument();
  await screen.findByRole("heading", { name: "Odłożony 6" });
  await user.keyboard("b");
  await user.click(await screen.findByRole("menuitem", { name: /^Jutro/ }));
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
  expect(await screen.findByText("12 lis, 08:00")).toBeInTheDocument();
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
  expect(r).toHaveAttribute("aria-label", expect.stringContaining("Zaplanowano na 6 lis, 08:00"));
  expect(screen.getByRole("link", { name: /Zaplanowane/ })).toHaveTextContent("1");

  await user.click(within(r).getByRole("button", { name: "Anuluj wysyłkę" }));
  const win = await screen.findByRole("dialog", { name: "Szkic 7" });
  expect(within(win).getByText("dev2@silo.test")).toBeInTheDocument();
  expect(mail.state.calls.cancel).toEqual(["ob_9"]);
  expect(await screen.findByText("Wysyłka anulowana")).toBeInTheDocument();
});

it("schedules a send from compose with a server time; Cofnij cancels it", async () => {
  const { mail, user } = setup();
  await screen.findByRole("grid");
  await user.keyboard("c");
  const win = await screen.findByRole("dialog", { name: "Nowa wiadomość" });
  await user.type(within(win).getByRole("combobox", { name: "Do" }), "dev2@silo.test,");
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Plan");
  await user.click(within(win).getByRole("button", { name: "Więcej opcji wysyłania" }));

  const menu = await screen.findByRole("menu", { name: "Zaplanuj wysyłkę" });
  await within(menu).findByRole("menuitem", { name: /Jutro rano/ });
  // Only the presets that make sense for sending; no time is computed in the browser.
  expect(within(menu).queryByRole("menuitem", { name: /Później dziś/ })).toBeNull();
  expect(within(menu).getByRole("menuitem", { name: /W poniedziałek rano/ })).toBeInTheDocument();
  await user.click(within(menu).getByRole("menuitem", { name: /Jutro rano/ }));

  await waitFor(() => expect(mail.state.calls.sendAt).toEqual([TOMORROW]));
  const snackbar = await screen.findByText(/^Wysyłka zaplanowana na/);
  expect(screen.queryByRole("dialog", { name: "Plan" })).toBeNull();
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Cofnij" }));
  expect(await screen.findByRole("dialog", { name: "Plan" })).toBeInTheDocument();
  expect(mail.state.calls.cancel).toEqual(["ob_1"]);
});
