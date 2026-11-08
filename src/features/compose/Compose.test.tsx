import { uploadConfig } from "../../api/drafts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { FakeEventSource } from "../../test/fakeEventSource";
import { FakeUploadXhr } from "../../test/fakeUploadXhr";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";
import { composeConfig } from "./session";

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  uploadConfig.createXhr = () => new FakeUploadXhr() as unknown as XMLHttpRequest;
});
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  composeConfig.autosaveMs = 2000;
});
afterAll(() => server.close());

function setup(url = "/u/0/inbox") {
  const mail = createMockMail();
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

async function openCompose(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("grid");
  await user.keyboard("c");
  return screen.findByRole("dialog", { name: "New message" });
}

it("opens a compose window with c, creating the draft on the server", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  expect(mail.state.calls.createDraft).toEqual([{ accountId: "acc_1" }]);
  expect(within(win).getByText("Dev One <dev1@silo.test>")).toBeInTheDocument();
  // Focus on the first empty field.
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "To" })).toHaveFocus());
  expect(within(win).getByRole("textbox", { name: "Message body" })).toBeInTheDocument();
});

it("opens compose from the Utwórz button", async () => {
  const { mail, user } = setup();
  await screen.findByRole("grid");
  await user.click(screen.getByRole("button", { name: "Compose" }));
  expect(await screen.findByRole("dialog", { name: "New message" })).toBeInTheDocument();
  expect(mail.state.calls.createDraft).toHaveLength(1);
});

it("autosaves after 2 s of idle time with the version and takes the new one", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const mail = createMockMail();
  server.use(...mail.handlers);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderApp("/u/0/inbox");
  const win = await openCompose(user);
  await user.type(within(win).getByRole("textbox", { name: "Subject" }), "Oferta");
  expect(mail.state.calls.putDraft).toHaveLength(0);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await waitFor(() => expect(mail.state.calls.putDraft).toHaveLength(1));
  expect(mail.state.calls.putDraft[0]).toMatchObject({ id: "d_1", version: 1, subject: "Oferta" });
  expect(await within(win).findByText("Saved")).toBeInTheDocument();

  await user.type(within(win).getByRole("textbox", { name: "Subject" }), " Q4");
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await waitFor(() => expect(mail.state.calls.putDraft).toHaveLength(2));
  // The second save carries the version of the first answer.
  expect(mail.state.calls.putDraft[1]).toMatchObject({ version: 2, subject: "Oferta Q4" });
});

it("shows the conflict bar on 409 and Nadpisz saves with the server's version", async () => {
  composeConfig.autosaveMs = 50;
  const { mail, user } = setup();
  const win = await openCompose(user);
  mail.saveElsewhere("d_1");
  await user.type(within(win).getByRole("textbox", { name: "Subject" }), "Moja wersja");
  expect(await within(win).findByText("This draft was changed")).toBeInTheDocument();
  expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ version: 1 });

  await user.click(within(win).getByRole("button", { name: "Overwrite" }));
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ version: 2, subject: "Moja wersja" }),
  );
  await waitFor(() => expect(within(win).queryByText("This draft was changed")).toBeNull());
  expect(mail.state.drafts.get("d_1")).toMatchObject({ version: 3, subject: "Moja wersja" });
  // The version came with the 409 (Problem.currentVersion): no GET /drafts/{id}.
  expect(mail.state.calls.getDraft).toEqual([]);
});

it("Wczytaj loads the draft carried by the 409 without another GET", async () => {
  composeConfig.autosaveMs = 50;
  const { mail, user } = setup();
  const win = await openCompose(user);
  mail.saveElsewhere("d_1");
  await user.type(within(win).getByRole("textbox", { name: "Subject" }), "Moja wersja");
  await within(win).findByText("This draft was changed");
  const gets = mail.state.calls.getDraft.length;
  await user.click(within(win).getByRole("button", { name: "Load" }));
  await waitFor(() =>
    expect(within(win).getByRole("textbox", { name: "Subject" })).toHaveValue(
      "Zmieniony gdzie indziej",
    ),
  );
  expect(mail.state.calls.getDraft).toHaveLength(gets);
});

it("a reply sends replyToMessageId and mode and opens prefilled", async () => {
  const { mail, user } = setup("/u/0/inbox/t_2");
  await screen.findByRole("heading", { name: "Temat 2" });
  await user.keyboard("a");
  const win = await screen.findByRole("dialog", { name: "Re: Temat 2" });
  expect(mail.state.calls.createDraft).toEqual([{ replyToMessageId: "m_t_2_2", mode: "replyAll" }]);
  const to = within(win).getByRole("list", { name: "Recipients: To" });
  expect(within(to).getByText("Nadawca 2")).toBeInTheDocument();
  const cc = within(win).getByRole("list", { name: "Recipients: Cc" });
  expect(within(cc).getByText("Inna Osoba")).toBeInTheDocument();
  expect(within(win).getByText("Cytowana treść")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Forward" }));
  await screen.findByRole("dialog", { name: "Fwd: Temat 2" });
  expect(mail.state.calls.createDraft[1]).toEqual({
    replyToMessageId: "m_t_2_2",
    mode: "forward",
  });
});

it("RecipientInput makes chips, marks invalid ones and removes with Backspace", async () => {
  const { user } = setup();
  const win = await openCompose(user);
  const to = within(win).getByRole("combobox", { name: "To" });
  await user.type(to, "ala@firma.pl,");
  await user.type(to, "zly-adres{Enter}");
  const chips = within(win).getByRole("list", { name: "Recipients: To" });
  expect(within(chips).getByText("ala@firma.pl")).toBeInTheDocument();
  expect(within(chips).getByText("zly-adres").closest("li")).toHaveTextContent("Invalid address");
  await user.click(to);
  await user.paste("Ola <ola@x.pl>; ewa@y.pl");
  expect(within(chips).getByText("Ola")).toBeInTheDocument();
  expect(within(chips).getByText("ewa@y.pl")).toBeInTheDocument();
  await user.keyboard("{Backspace}");
  expect(within(chips).queryByText("ewa@y.pl")).toBeNull();
  expect(within(chips).getAllByRole("listitem")).toHaveLength(3);
});

it("RecipientInput suggests contacts and is driven with the arrow keys", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  const to = within(win).getByRole("combobox", { name: "To" });
  await user.type(to, "jan");
  const list = await within(win).findByRole("listbox", { name: "Address suggestions" });
  expect(mail.state.calls.contacts).toEqual(["jan"]);
  const options = within(list).getAllByRole("option");
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{ArrowDown}");
  expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{Enter}");
  const chips = within(win).getByRole("list", { name: "Recipients: To" });
  expect(within(chips).getByText("Janina Nowak")).toBeInTheDocument();
  expect(within(win).queryByRole("listbox")).toBeNull();
  expect(to).toHaveValue("");
  // Esc closes the suggestions, not the window.
  await user.type(to, "me");
  await within(win).findByRole("listbox");
  await user.keyboard("{Escape}");
  expect(within(win).queryByRole("listbox")).toBeNull();
  expect(screen.getByRole("dialog", { name: "New message" })).toBeInTheDocument();
});

it("uploads attachments with progress, attaches them on the next save and reports 413", async () => {
  composeConfig.autosaveMs = 50;
  FakeUploadXhr.paused = true;
  const { mail, user } = setup();
  // /meta allows the file, the upload itself is refused: the message uses Problem.limit.
  mail.state.metaMaxAttachmentBytes = 1_000_000;
  const win = await openCompose(user);
  const input = within(win).getByLabelText<HTMLInputElement>("Attach files", {
    selector: "input",
  });
  await user.upload(input, [
    new File(["x".repeat(200)], "umowa.pdf", { type: "application/pdf" }),
    new File(["x".repeat(5000)], "film.mov", { type: "video/quicktime" }),
  ]);
  const list = await within(win).findByRole("list", { name: "Attachments" });
  const bar = await within(list).findByRole("progressbar", { name: "Uploading umowa.pdf" });
  await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "50"));
  FakeUploadXhr.paused = false;
  FakeUploadXhr.release();
  expect(
    await within(list).findByText("The file film.mov exceeds the 1,000 B attachment limit."),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ attachmentIds: ["u_1"] }),
  );
  expect(within(list).getByText("umowa.pdf")).toBeInTheDocument();
  expect(within(list).queryByRole("progressbar")).toBeNull();
  expect(mail.state.calls.uploads.sort()).toEqual(["film.mov", "umowa.pdf"]);
});

it("sends, shows Cofnij and the undo reopens the window with the draft", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("combobox", { name: "To" }), "dev2@silo.test,");
  await user.type(within(win).getByRole("textbox", { name: "Subject" }), "Cześć");
  await user.click(within(win).getByRole("button", { name: "Send" }));

  expect(await screen.findByText("Message sent")).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Cześć" })).toBeNull();
  // The last save went out before the send.
  expect(mail.state.calls.putDraft.at(-1)).toMatchObject({
    subject: "Cześć",
    to: [{ email: "dev2@silo.test" }],
  });
  expect(mail.state.calls.send).toEqual(["d_1"]);

  await user.click(screen.getByRole("button", { name: "Undo" }));
  const again = await screen.findByRole("dialog", { name: "Cześć" });
  expect(mail.state.calls.cancel).toEqual(["ob_1"]);
  expect(within(again).getByText("dev2@silo.test")).toBeInTheDocument();
  expect(await screen.findByText("Sending undone")).toBeInTheDocument();
});

it("says it is too late when the send is already in progress", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("combobox", { name: "To" }), "dev2@silo.test,");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await screen.findByText("Message sent");
  mail.state.outbound.get("ob_1")!.status = "sending";
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(await screen.findByText("Too late, the message has been sent")).toBeInTheDocument();
});

it("shows send refusals in the window", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.click(within(win).getByRole("button", { name: "Send" }));
  expect(await within(win).findByText("Add at least one recipient.")).toBeInTheDocument();
  mail.state.sendProblem = {
    status: 413,
    code: "message_too_large",
    limit: 25 * 1024 * 1024,
    size: 30 * 1024 * 1024,
  };
  await user.type(within(win).getByRole("combobox", { name: "To" }), "dev2@silo.test,");
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(
    await within(win).findByText(
      "The message with attachments (30.0 MB) exceeds the 25.0 MB limit.",
    ),
  ).toBeInTheDocument();
});

it("refuses a file over maxAttachmentBytes of /meta before uploading it", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  const input = within(win).getByLabelText<HTMLInputElement>("Attach files", {
    selector: "input",
  });
  await waitFor(() => expect(mail.state.calls.meta).toBeGreaterThan(0));
  await user.upload(input, [new File(["x".repeat(5000)], "film.mov")]);
  const list = await within(win).findByRole("list", { name: "Attachments" });
  expect(
    await within(list).findByText("The file film.mov exceeds the 1,000 B attachment limit."),
  ).toBeInTheDocument();
  expect(mail.state.calls.uploads).toEqual([]);
});

it("invalid_address marks the refused recipient red and names it", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("combobox", { name: "To" }), "jan@firma.pl,zly@adres.pl,");
  mail.state.sendProblem = {
    status: 422,
    code: "invalid_address",
    address: "zly@adres.pl",
    field: "to",
  };
  await user.click(within(win).getByRole("button", { name: "Send" }));
  expect(
    await within(win).findByText(/Invalid recipient address: zly@adres.pl/),
  ).toBeInTheDocument();
  const to = within(win).getByRole("list", { name: "Recipients: To" });
  const chip = within(to).getByTitle("zly@adres.pl");
  expect(within(chip).getByText("Invalid address")).toBeInTheDocument();
  expect(within(within(to).getByTitle("jan@firma.pl")).queryByText("Invalid address")).toBeNull();

  // Removing the address clears the mark.
  await user.click(within(chip).getByRole("button"));
  expect(within(to).queryByTitle("zly@adres.pl")).toBeNull();
});

it("outbound.status failed shows a snackbar that opens the draft with the error", async () => {
  const { mail } = setup();
  await screen.findByRole("grid");
  // The server writes Draft.lastSend in the transaction of the event.
  mail.addDraftThread(9, {
    lastSend: {
      outboundId: "ob_7",
      status: "failed",
      error: "550 relay denied",
      failedRecipients: ["x@y.pl"],
      updatedAt: "2026-11-05T09:00:00Z",
    },
  });
  act(() =>
    FakeEventSource.latest().emit("outbound.status", {
      outboundId: "ob_7",
      accountId: "acc_1",
      messageId: "m_t_9_2",
      draftId: "d_t_9_2",
      status: "failed",
      error: "550 relay denied",
      failedRecipients: ["x@y.pl"],
    }),
  );
  expect(await screen.findByText("Couldn't send")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Open" }));
  const win = await screen.findByRole("dialog", { name: "Szkic 9" });
  expect(
    within(win).getByText(/Couldn't send: 550 relay denied Rejected recipients: x@y.pl/),
  ).toBeInTheDocument();
});

it("Odrzuć deletes the draft and closes the window", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.click(within(win).getByRole("button", { name: "Discard draft" }));
  expect(screen.queryByRole("dialog", { name: "New message" })).toBeNull();
  expect(await screen.findByText("Draft discarded")).toBeInTheDocument();
  await waitFor(() => expect(mail.state.calls.deleteDraft).toEqual(["d_1"]));
});

it("a draft whose last send failed shows the error after a reload (Draft.lastSend)", async () => {
  const { mail, user } = setup("/u/0/drafts");
  mail.addDraftThread(9, {
    lastSend: {
      outboundId: "ob_3",
      status: "failed",
      error: "554 message refused",
      failedRecipients: [],
      updatedAt: "2026-11-05T09:00:00Z",
    },
  });
  await user.click(await screen.findByRole("row", { name: /Szkic 9/ }));
  const win = await screen.findByRole("dialog", { name: "Szkic 9" });
  expect(await within(win).findByText("Couldn't send: 554 message refused")).toBeInTheDocument();
});

it("closing the window saves with syncNow, also an autosaved draft", async () => {
  composeConfig.autosaveMs = 50;
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("textbox", { name: "Subject" }), "Szkic");
  // On a slow machine typing may autosave in parts: wait for the whole subject.
  await waitFor(() => expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ subject: "Szkic" }));
  const n = mail.state.calls.putDraft.length;
  expect(mail.state.calls.putDraft.every((p) => p.syncNow === undefined)).toBe(true);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(mail.state.calls.putDraft).toHaveLength(n + 1));
  expect(mail.state.calls.putDraft[n]).toMatchObject({ subject: "Szkic", syncNow: true });
  expect(mail.state.drafts.get("d_1")).toMatchObject({ syncedVersion: n + 2, version: n + 2 });
});

it("Esc saves and closes; an untouched new draft is dropped", async () => {
  const { mail, user } = setup();
  let win = await openCompose(user);
  await user.type(within(win).getByRole("textbox", { name: "Subject" }), "Notatka");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ id: "d_1", subject: "Notatka" }),
  );
  expect(mail.state.calls.deleteDraft).toEqual([]);

  win = await openCompose(user);
  await user.click(within(win).getByRole("button", { name: "Save & close" }));
  await waitFor(() => expect(mail.state.calls.deleteDraft).toEqual(["d_2"]));
});

it("a row of Drafts opens its draft in a compose window", async () => {
  const { mail, user } = setup("/u/0/drafts");
  mail.addDraftThread(9);
  const row = await screen.findByRole("row", { name: /Szkic 9/ });
  await user.click(row);
  const win = await screen.findByRole("dialog", { name: "Szkic 9" });
  expect(within(win).getByRole("textbox", { name: "Subject" })).toHaveValue("Szkic 9");
});

it("draft.updated from another tab shows the conflict bar", async () => {
  const { user } = setup();
  const win = await openCompose(user);
  act(() =>
    FakeEventSource.latest().emit("draft.updated", {
      draftId: "d_1",
      accountId: "acc_1",
      version: 2,
      source: "silo",
      origin: "other-tab",
    }),
  );
  expect(await within(win).findByText("This draft was changed")).toBeInTheDocument();
});

it("Shift+C opens a maximised window; Ctrl+Shift+C/B reveal DW and UDW", async () => {
  const { user } = setup();
  await screen.findByRole("grid");
  await user.keyboard("{Shift>}C{/Shift}");
  const win = await screen.findByRole("dialog", { name: "New message" });
  expect(within(win).getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "To" })).toHaveFocus());
  await user.keyboard("{Control>}{Shift>}C{/Shift}{/Control}");
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "Cc" })).toHaveFocus());
  await user.keyboard("{Control>}{Shift>}B{/Shift}{/Control}");
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "Bcc" })).toHaveFocus());
  // Minimise keeps the window in the dock with its title only.
  await user.click(within(win).getByRole("button", { name: "Minimize" }));
  expect(within(win).queryByRole("combobox")).toBeNull();
});

it("maximise keeps the window editable and fixed to the viewport, and restores it", async () => {
  const { user } = setup();
  const win = await openCompose(user);
  const docked = win.className;
  expect(win).toHaveClass("relative");

  await user.click(within(win).getByRole("button", { name: "Full screen" }));
  // Fixed and centred by its insets only: no `relative` (it wins over `fixed` in the CSS and
  // pushed the window off screen) and no offset of its own.
  expect(win).toHaveClass("fixed", "inset-x-[8vw]", "top-[5vh]", "bottom-[5vh]", "z-40");
  expect(win).not.toHaveClass("relative");
  expect(win.getAttribute("style")).toBeNull();
  // The backdrop lies below the window.
  const backdrop = win.previousElementSibling as HTMLElement;
  expect(backdrop).toHaveClass("fixed", "inset-0", "z-30");

  const subject = within(win).getByRole("textbox", { name: "Subject" });
  await user.click(subject);
  await user.keyboard("Pełny ekran działa");
  expect(subject).toHaveValue("Pełny ekran działa");
  expect(within(win).getByRole("textbox", { name: "Message body" })).toBeInTheDocument();

  await user.click(within(win).getByRole("button", { name: "Exit full screen" }));
  expect(win.className).toBe(docked);
  expect(win.previousElementSibling).toBeNull();

  // Minimise straight from full screen, then restore to the docked size.
  await user.click(within(win).getByRole("button", { name: "Full screen" }));
  await user.click(within(win).getByRole("button", { name: "Minimize" }));
  expect(win).toHaveClass("relative", "w-64");
  expect(win.previousElementSibling).toBeNull();
  await user.click(within(win).getByRole("button", { name: "Restore" }));
  expect(win.className).toBe(docked);
  expect(within(win).getByRole("textbox", { name: "Subject" })).toHaveValue("Pełny ekran działa");
});
