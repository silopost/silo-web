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
  return screen.findByRole("dialog", { name: "Nowa wiadomość" });
}

it("opens a compose window with c, creating the draft on the server", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  expect(mail.state.calls.createDraft).toEqual([{ accountId: "acc_1" }]);
  expect(within(win).getByText("Dev One <dev1@silo.test>")).toBeInTheDocument();
  // Focus on the first empty field.
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "Do" })).toHaveFocus());
  expect(within(win).getByRole("textbox", { name: "Treść wiadomości" })).toBeInTheDocument();
});

it("opens compose from the Utwórz button", async () => {
  const { mail, user } = setup();
  await screen.findByRole("grid");
  await user.click(screen.getByRole("button", { name: "Utwórz" }));
  expect(await screen.findByRole("dialog", { name: "Nowa wiadomość" })).toBeInTheDocument();
  expect(mail.state.calls.createDraft).toHaveLength(1);
});

it("autosaves after 2 s of idle time with the version and takes the new one", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const mail = createMockMail();
  server.use(...mail.handlers);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderApp("/u/0/inbox");
  const win = await openCompose(user);
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Oferta");
  expect(mail.state.calls.putDraft).toHaveLength(0);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  await waitFor(() => expect(mail.state.calls.putDraft).toHaveLength(1));
  expect(mail.state.calls.putDraft[0]).toMatchObject({ id: "d_1", version: 1, subject: "Oferta" });
  expect(await within(win).findByText("Zapisano")).toBeInTheDocument();

  await user.type(within(win).getByRole("textbox", { name: "Temat" }), " Q4");
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
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Moja wersja");
  expect(await within(win).findByText("Ta wersja robocza została zmieniona")).toBeInTheDocument();
  expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ version: 1 });

  await user.click(within(win).getByRole("button", { name: "Nadpisz" }));
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ version: 2, subject: "Moja wersja" }),
  );
  await waitFor(() =>
    expect(within(win).queryByText("Ta wersja robocza została zmieniona")).toBeNull(),
  );
  expect(mail.state.drafts.get("d_1")).toMatchObject({ version: 3, subject: "Moja wersja" });
  // The version came with the 409 (Problem.currentVersion): no GET /drafts/{id}.
  expect(mail.state.calls.getDraft).toEqual([]);
});

it("Wczytaj loads the draft carried by the 409 without another GET", async () => {
  composeConfig.autosaveMs = 50;
  const { mail, user } = setup();
  const win = await openCompose(user);
  mail.saveElsewhere("d_1");
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Moja wersja");
  await within(win).findByText("Ta wersja robocza została zmieniona");
  const gets = mail.state.calls.getDraft.length;
  await user.click(within(win).getByRole("button", { name: "Wczytaj" }));
  await waitFor(() =>
    expect(within(win).getByRole("textbox", { name: "Temat" })).toHaveValue(
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
  const to = within(win).getByRole("list", { name: "Odbiorcy: Do" });
  expect(within(to).getByText("Nadawca 2")).toBeInTheDocument();
  const cc = within(win).getByRole("list", { name: "Odbiorcy: DW" });
  expect(within(cc).getByText("Inna Osoba")).toBeInTheDocument();
  expect(within(win).getByText("Cytowana treść")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Przekaż" }));
  await screen.findByRole("dialog", { name: "Fwd: Temat 2" });
  expect(mail.state.calls.createDraft[1]).toEqual({
    replyToMessageId: "m_t_2_2",
    mode: "forward",
  });
});

it("RecipientInput makes chips, marks invalid ones and removes with Backspace", async () => {
  const { user } = setup();
  const win = await openCompose(user);
  const to = within(win).getByRole("combobox", { name: "Do" });
  await user.type(to, "ala@firma.pl,");
  await user.type(to, "zly-adres{Enter}");
  const chips = within(win).getByRole("list", { name: "Odbiorcy: Do" });
  expect(within(chips).getByText("ala@firma.pl")).toBeInTheDocument();
  expect(within(chips).getByText("zly-adres").closest("li")).toHaveTextContent(
    "Nieprawidłowy adres",
  );
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
  const to = within(win).getByRole("combobox", { name: "Do" });
  await user.type(to, "jan");
  const list = await within(win).findByRole("listbox", { name: "Podpowiedzi adresów" });
  expect(mail.state.calls.contacts).toEqual(["jan"]);
  const options = within(list).getAllByRole("option");
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{ArrowDown}");
  expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  await user.keyboard("{Enter}");
  const chips = within(win).getByRole("list", { name: "Odbiorcy: Do" });
  expect(within(chips).getByText("Janina Nowak")).toBeInTheDocument();
  expect(within(win).queryByRole("listbox")).toBeNull();
  expect(to).toHaveValue("");
  // Esc closes the suggestions, not the window.
  await user.type(to, "ja");
  await within(win).findByRole("listbox");
  await user.keyboard("{Escape}");
  expect(within(win).queryByRole("listbox")).toBeNull();
  expect(screen.getByRole("dialog", { name: "Nowa wiadomość" })).toBeInTheDocument();
});

it("uploads attachments with progress, attaches them on the next save and reports 413", async () => {
  composeConfig.autosaveMs = 50;
  FakeUploadXhr.paused = true;
  const { mail, user } = setup();
  // /meta allows the file, the upload itself is refused: the message uses Problem.limit.
  mail.state.metaMaxAttachmentBytes = 1_000_000;
  const win = await openCompose(user);
  const input = within(win).getByLabelText<HTMLInputElement>("Załącz pliki", {
    selector: "input",
  });
  await user.upload(input, [
    new File(["x".repeat(200)], "umowa.pdf", { type: "application/pdf" }),
    new File(["x".repeat(5000)], "film.mov", { type: "video/quicktime" }),
  ]);
  const list = await within(win).findByRole("list", { name: "Załączniki" });
  const bar = await within(list).findByRole("progressbar", { name: "Przesyłanie umowa.pdf" });
  await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "50"));
  FakeUploadXhr.paused = false;
  FakeUploadXhr.release();
  expect(
    await within(list).findByText("Plik film.mov przekracza limit załącznika 1000 B."),
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
  await user.type(within(win).getByRole("combobox", { name: "Do" }), "dev2@silo.test,");
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Cześć");
  await user.click(within(win).getByRole("button", { name: "Wyślij" }));

  expect(await screen.findByText("Wiadomość wysłana")).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Cześć" })).toBeNull();
  // The last save went out before the send.
  expect(mail.state.calls.putDraft.at(-1)).toMatchObject({
    subject: "Cześć",
    to: [{ email: "dev2@silo.test" }],
  });
  expect(mail.state.calls.send).toEqual(["d_1"]);

  await user.click(screen.getByRole("button", { name: "Cofnij" }));
  const again = await screen.findByRole("dialog", { name: "Cześć" });
  expect(mail.state.calls.cancel).toEqual(["ob_1"]);
  expect(within(again).getByText("dev2@silo.test")).toBeInTheDocument();
  expect(await screen.findByText("Wysyłanie cofnięte")).toBeInTheDocument();
});

it("says it is too late when the send is already in progress", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("combobox", { name: "Do" }), "dev2@silo.test,");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await screen.findByText("Wiadomość wysłana");
  mail.state.outbound.get("ob_1")!.status = "sending";
  await user.click(screen.getByRole("button", { name: "Cofnij" }));
  expect(await screen.findByText("Za późno, wiadomość została wysłana")).toBeInTheDocument();
});

it("shows send refusals in the window", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.click(within(win).getByRole("button", { name: "Wyślij" }));
  expect(await within(win).findByText("Dodaj co najmniej jednego odbiorcę.")).toBeInTheDocument();
  mail.state.sendProblem = {
    status: 413,
    code: "message_too_large",
    limit: 25 * 1024 * 1024,
    size: 30 * 1024 * 1024,
  };
  await user.type(within(win).getByRole("combobox", { name: "Do" }), "dev2@silo.test,");
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(
    await within(win).findByText("Wiadomość z załącznikami (30,0 MB) przekracza limit 25,0 MB."),
  ).toBeInTheDocument();
});

it("refuses a file over maxAttachmentBytes of /meta before uploading it", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  const input = within(win).getByLabelText<HTMLInputElement>("Załącz pliki", {
    selector: "input",
  });
  await waitFor(() => expect(mail.state.calls.meta).toBeGreaterThan(0));
  await user.upload(input, [new File(["x".repeat(5000)], "film.mov")]);
  const list = await within(win).findByRole("list", { name: "Załączniki" });
  expect(
    await within(list).findByText("Plik film.mov przekracza limit załącznika 1000 B."),
  ).toBeInTheDocument();
  expect(mail.state.calls.uploads).toEqual([]);
});

it("invalid_address marks the refused recipient red and names it", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("combobox", { name: "Do" }), "jan@firma.pl,zly@adres.pl,");
  mail.state.sendProblem = {
    status: 422,
    code: "invalid_address",
    address: "zly@adres.pl",
    field: "to",
  };
  await user.click(within(win).getByRole("button", { name: "Wyślij" }));
  expect(
    await within(win).findByText(/Nieprawidłowy adres odbiorcy: zly@adres.pl/),
  ).toBeInTheDocument();
  const to = within(win).getByRole("list", { name: "Odbiorcy: Do" });
  const chip = within(to).getByTitle("zly@adres.pl");
  expect(within(chip).getByText("Nieprawidłowy adres")).toBeInTheDocument();
  expect(
    within(within(to).getByTitle("jan@firma.pl")).queryByText("Nieprawidłowy adres"),
  ).toBeNull();

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
  expect(await screen.findByText("Nie udało się wysłać")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Otwórz" }));
  const win = await screen.findByRole("dialog", { name: "Szkic 9" });
  expect(
    within(win).getByText(/Nie udało się wysłać: 550 relay denied Odrzuceni odbiorcy: x@y.pl/),
  ).toBeInTheDocument();
});

it("Odrzuć deletes the draft and closes the window", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.click(within(win).getByRole("button", { name: "Odrzuć wersję roboczą" }));
  expect(screen.queryByRole("dialog", { name: "Nowa wiadomość" })).toBeNull();
  expect(await screen.findByText("Wersja robocza odrzucona")).toBeInTheDocument();
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
  expect(
    await within(win).findByText("Nie udało się wysłać: 554 message refused"),
  ).toBeInTheDocument();
});

it("closing the window saves with syncNow, also an autosaved draft", async () => {
  composeConfig.autosaveMs = 50;
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Szkic");
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
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Notatka");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ id: "d_1", subject: "Notatka" }),
  );
  expect(mail.state.calls.deleteDraft).toEqual([]);

  win = await openCompose(user);
  await user.click(within(win).getByRole("button", { name: "Zapisz i zamknij" }));
  await waitFor(() => expect(mail.state.calls.deleteDraft).toEqual(["d_2"]));
});

it("a row of Drafts opens its draft in a compose window", async () => {
  const { mail, user } = setup("/u/0/drafts");
  mail.addDraftThread(9);
  const row = await screen.findByRole("row", { name: /Szkic 9/ });
  await user.click(row);
  const win = await screen.findByRole("dialog", { name: "Szkic 9" });
  expect(within(win).getByRole("textbox", { name: "Temat" })).toHaveValue("Szkic 9");
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
  expect(await within(win).findByText("Ta wersja robocza została zmieniona")).toBeInTheDocument();
});

it("Shift+C opens a maximised window; Ctrl+Shift+C/B reveal DW and UDW", async () => {
  const { user } = setup();
  await screen.findByRole("grid");
  await user.keyboard("{Shift>}C{/Shift}");
  const win = await screen.findByRole("dialog", { name: "Nowa wiadomość" });
  expect(within(win).getByRole("button", { name: "Zamknij pełny ekran" })).toBeInTheDocument();
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "Do" })).toHaveFocus());
  await user.keyboard("{Control>}{Shift>}C{/Shift}{/Control}");
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "DW" })).toHaveFocus());
  await user.keyboard("{Control>}{Shift>}B{/Shift}{/Control}");
  await waitFor(() => expect(within(win).getByRole("combobox", { name: "UDW" })).toHaveFocus());
  // Minimise keeps the window in the dock with its title only.
  await user.click(within(win).getByRole("button", { name: "Minimalizuj" }));
  expect(within(win).queryByRole("combobox")).toBeNull();
});
