import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FakeEventSource } from "../../test/fakeEventSource";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

type Mail = ReturnType<typeof createMockMail>;

function setup(url: string, prepare?: (mail: Mail) => void) {
  const mail = createMockMail();
  prepare?.(mail);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  const app = renderApp(url);
  return { mail, user, ...app };
}

const labelsOf = (mail: Mail) => {
  mail.state.extraLabels = [
    mail.makeLabel("l_praca", "Praca", { colorBg: "#4a86e8", colorText: "#ffffff" }),
    mail.makeLabel("l_proj", "Projekty", {
      parentId: "l_praca",
      keywordState: "partial",
      localOnlyFolders: ["f_9"],
    }),
    mail.makeLabel("l_lok", "Lokalna", { keywordState: "local_only" }),
    mail.makeLabel("l_arch", "Stare", { type: "folder", keywordState: null }),
  ];
};

describe("general settings", () => {
  it("applies the density at once and PATCHes only that field", async () => {
    const { mail, user } = setup("/u/0/settings/general");
    await user.click(await screen.findByRole("radio", { name: "Kompaktowa" }));
    expect(document.documentElement.dataset.density).toBe("compact");
    await waitFor(() => expect(mail.state.calls.settings).toEqual([{ density: "compact" }]));
  });

  it("sends the undo send period alone", async () => {
    const { mail, user } = setup("/u/0/settings/general");
    await user.selectOptions(
      await screen.findByRole("combobox", { name: /Okres anulowania/ }),
      "20",
    );
    await waitFor(() => expect(mail.state.calls.settings).toEqual([{ undoSendSeconds: 20 }]));
    expect(mail.session.settings.undoSendSeconds).toBe(20);
  });

  it("shows 422 invalid_timezone and keeps the old value", async () => {
    const { mail, user } = setup("/u/0/settings/general", (m) => {
      m.state.settingsProblem.timezone = { status: 422, code: "invalid_timezone" };
    });
    const select = await screen.findByRole("combobox", { name: "Strefa czasowa" });
    expect(select).toHaveValue("Europe/Warsaw");
    await user.selectOptions(select, "Asia/Tokyo");
    expect(await screen.findByText("Nieznana strefa czasowa.")).toBeInTheDocument();
    expect(mail.state.calls.settings).toEqual([{ timezone: "Asia/Tokyo" }]);
    await waitFor(() => expect(select).toHaveValue("Europe/Warsaw"));
  });

  it("reloads the settings on settings.updated from another session", async () => {
    const { mail } = setup("/u/0/settings/general");
    const box = await screen.findByRole("checkbox", { name: "Skróty klawiszowe włączone" });
    expect(box).toBeChecked();
    mail.session.settings = { ...mail.session.settings, keyboardShortcutsEnabled: false };
    act(() =>
      FakeEventSource.latest().emit("settings.updated", { updatedAt: "2026-11-05T10:00:00Z" }),
    );
    await waitFor(() => expect(box).not.toBeChecked());
  });

  it("saves the signature and puts it into a new message", async () => {
    const { mail, user } = setup("/u/0/settings/general", (m) => {
      m.session.settings.signature = "<p>Pozdrawiam, Dev</p>";
    });
    expect(await screen.findByRole("textbox", { name: "Podpis" })).toHaveTextContent(
      "Pozdrawiam, Dev",
    );
    await user.keyboard("c");
    const win = await screen.findByRole("dialog", { name: "Nowa wiadomość" });
    const body = within(win).getByRole("textbox", { name: "Treść wiadomości" });
    await waitFor(() =>
      expect(body.querySelector(".silo-signature")).toHaveTextContent("Pozdrawiam, Dev"),
    );
    expect(mail.state.calls.putDraft).toEqual([]);
  });

  it("turns desktop notifications on after the browser allows them and notifies in the background", async () => {
    const created: {
      title: string;
      options?: NotificationOptions;
      onclick: (() => void) | null;
    }[] = [];
    class FakeNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = vi.fn(async () => {
        FakeNotification.permission = "granted";
        return "granted" as const;
      });
      onclick: (() => void) | null = null;
      constructor(title: string, options?: NotificationOptions) {
        created.push(this as unknown as (typeof created)[number]);
        Object.assign(this, { title, options });
      }
      close() {}
    }
    vi.stubGlobal("Notification", FakeNotification);
    const { mail, user, router } = setup("/u/0/settings/general");
    await user.click(await screen.findByRole("checkbox", { name: "Powiadomienia na pulpicie" }));
    await waitFor(() =>
      expect(mail.state.calls.settings).toEqual([{ desktopNotifications: true }]),
    );
    expect(FakeNotification.requestPermission).toHaveBeenCalled();

    const event = {
      accountId: "acc_1",
      threadId: "t_3",
      messageId: "m_9",
      labelIds: ["INBOX", "UNREAD"],
      from: { name: "Jan Kowalski", email: "jan@firma.pl" },
      subject: "Spotkanie",
      snippet: "Jutro o 10",
    };
    // The tab is in front: no notification.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    act(() => FakeEventSource.latest().emit("message.new", event));
    expect(created).toHaveLength(0);
    // In the background; a message outside INBOX is skipped.
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    act(() => FakeEventSource.latest().emit("message.new", { ...event, labelIds: ["SPAM"] }));
    act(() => FakeEventSource.latest().emit("message.new", event));
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe("Nowa wiadomość od Jan Kowalski");
    act(() => created[0]!.onclick?.());
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/inbox/t_3"));
  });

  it("does not turn notifications on when the browser refuses", async () => {
    class Denied {
      static permission: NotificationPermission = "default";
      static requestPermission = async () => "denied" as const;
    }
    vi.stubGlobal("Notification", Denied);
    const { mail, user } = setup("/u/0/settings/general");
    await user.click(await screen.findByRole("checkbox", { name: "Powiadomienia na pulpicie" }));
    expect(await screen.findByText(/Przeglądarka blokuje powiadomienia/)).toBeInTheDocument();
    expect(mail.state.calls.settings).toEqual([]);
  });

  it("opens from the gear in the top bar", async () => {
    const { user, router } = setup("/u/0/inbox");
    await screen.findByRole("grid");
    await user.click(screen.getByRole("link", { name: "Ustawienia" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/settings/general"));
    expect(await screen.findByRole("heading", { name: "Ustawienia" })).toBeInTheDocument();
  });
});

describe("labels", () => {
  it("shows user labels as a tree with keyword warnings and folders apart", async () => {
    setup("/u/0/settings/labels", (m) => {
      labelsOf(m);
    });
    const user = await screen.findByRole("region", { name: "Etykiety" });
    const rows = await within(user).findAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Lokalna", "Praca", "Projekty"]);
    expect(rows[2]!.style.paddingLeft).toBe("1.5rem");
    expect(
      within(rows[0]!).getByRole("img", { name: /Etykieta tylko w Silo/ }),
    ).toBeInTheDocument();
    // partial: the folder ids are shown by name (sync-status folders; unknown ids as they are).
    expect(
      within(rows[2]!).getByRole("img", { name: "W folderze f_9 tylko lokalnie." }),
    ).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole("img")).toBeNull();
    const folders = screen.getByRole("region", { name: "Foldery na serwerze" });
    expect(within(folders).getByRole("listitem", { name: "Stare" })).toBeInTheDocument();
  });

  it("shows the banner of 3.7 when the server keeps no keywords", async () => {
    setup("/u/0/settings/labels", (m) => {
      m.state.keywordsSupported = false;
    });
    expect(
      await screen.findByText(
        "Etykiety są zapisywane tylko w Silo – nie będą widoczne w innych programach pocztowych i wymagają kopii zapasowej Silo",
      ),
    ).toBeInTheDocument();
  });

  it("marks local-only labels in LeftNav", async () => {
    setup("/u/0/inbox", labelsOf);
    const nav = await screen.findByRole("navigation", { name: "Menu główne" });
    const link = await within(nav).findByRole("link", { name: /Lokalna/ });
    expect(within(link).getByRole("img", { name: /Etykieta tylko w Silo/ })).toBeInTheDocument();
  });

  it("creates a label with colour and parent, renames it and deletes after confirming", async () => {
    const { mail, user } = setup("/u/0/settings/labels", labelsOf);
    await screen.findByRole("listitem", { name: "Praca" });
    await user.click(screen.getByRole("button", { name: "Nowa etykieta" }));
    let dialog = await screen.findByRole("dialog", { name: "Nowa etykieta" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nazwa" }), "Faktury");
    await user.click(within(dialog).getByRole("radio", { name: "#16a766" }));
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Zagnieżdż w" }),
      "l_praca",
    );
    await user.click(within(dialog).getByRole("button", { name: "Utwórz" }));
    await waitFor(() =>
      expect(mail.state.calls.labelsCreate).toEqual([
        {
          accountId: "acc_1",
          name: "Faktury",
          type: "user",
          colorBg: "#16a766",
          colorText: "#ffffff",
          parentId: "l_praca",
        },
      ]),
    );
    const row = await screen.findByRole("listitem", { name: "Faktury" });

    await user.click(within(row).getByRole("button", { name: "Edytuj etykietę Faktury" }));
    dialog = await screen.findByRole("dialog", { name: "Edytuj etykietę Faktury" });
    const name = within(dialog).getByRole("textbox", { name: "Nazwa" });
    await user.clear(name);
    await user.type(name, "Rachunki");
    await user.click(within(dialog).getByRole("radio", { name: "Bez koloru" }));
    await user.click(within(dialog).getByRole("button", { name: "Zapisz" }));
    await waitFor(() =>
      expect(mail.state.calls.labelsPatch).toEqual([
        { id: "l_new1", name: "Rachunki", colorBg: "", colorText: "" },
      ]),
    );

    const renamed = await screen.findByRole("listitem", { name: "Rachunki" });
    await user.selectOptions(
      within(renamed).getByRole("combobox", { name: "Na liście etykiet: Rachunki" }),
      "hide",
    );
    await waitFor(() =>
      expect(mail.state.calls.labelsPatch[1]).toEqual({ id: "l_new1", showInList: "hide" }),
    );

    await user.click(within(renamed).getByRole("button", { name: "Usuń Rachunki" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Usunąć etykietę „Rachunki”?" });
    expect(confirm).toHaveTextContent("Wiadomości nie zostaną usunięte");
    await user.click(within(confirm).getByRole("button", { name: "Usuń" }));
    await waitFor(() => expect(mail.state.calls.labelsDelete).toEqual(["l_new1"]));
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Rachunki" })).toBeNull());
  });

  it("moves a label to another parent and to the top level with PATCH parentId", async () => {
    const { mail, user } = setup("/u/0/settings/labels", (m) => {
      labelsOf(m);
      m.state.extraLabels.push(m.makeLabel("l_dom", "Dom"));
    });
    const praca = await screen.findByRole("listitem", { name: "Praca" });
    await user.click(within(praca).getByRole("button", { name: "Edytuj etykietę Praca" }));
    let dialog = await screen.findByRole("dialog", { name: "Edytuj etykietę Praca" });
    const parent = within(dialog).getByRole("combobox", { name: "Zagnieżdż w" });
    // Neither the label itself nor its child Projekty can be its parent.
    const options = within(parent)
      .getAllByRole("option")
      .map((o) => o.getAttribute("value"));
    expect(options).toEqual(["", "l_dom", "l_lok"]);
    await user.selectOptions(parent, "l_dom");
    await user.click(within(dialog).getByRole("button", { name: "Zapisz" }));
    await waitFor(() =>
      expect(mail.state.calls.labelsPatch).toEqual([
        { id: "l_praca", parentId: "l_dom", colorBg: "#4a86e8", colorText: "#ffffff" },
      ]),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const proj = await screen.findByRole("listitem", { name: "Projekty" });
    await user.click(within(proj).getByRole("button", { name: "Edytuj etykietę Projekty" }));
    dialog = await screen.findByRole("dialog", { name: "Edytuj etykietę Projekty" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Zagnieżdż w" }), "");
    await user.click(within(dialog).getByRole("button", { name: "Zapisz" }));
    await waitFor(() =>
      expect(mail.state.calls.labelsPatch[1]).toEqual({
        id: "l_proj",
        parentId: null,
        colorBg: "",
        colorText: "",
      }),
    );
  });

  it("shows 422 invalid_parent in the dialog and keeps it open", async () => {
    const { mail, user } = setup("/u/0/settings/labels", (m) => {
      labelsOf(m);
      m.state.labelParentProblem = { status: 422, code: "invalid_parent" };
    });
    const lok = await screen.findByRole("listitem", { name: "Lokalna" });
    await user.click(within(lok).getByRole("button", { name: "Edytuj etykietę Lokalna" }));
    const dialog = await screen.findByRole("dialog", { name: "Edytuj etykietę Lokalna" });
    const parent = within(dialog).getByRole("combobox", { name: "Zagnieżdż w" });
    await user.selectOptions(parent, "l_praca");
    await user.click(within(dialog).getByRole("button", { name: "Zapisz" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /Nie można zagnieździć etykiety/,
    );
    expect(parent).toHaveAttribute("aria-invalid", "true");
    expect(mail.state.calls.labelsPatch[0]).toMatchObject({ id: "l_lok", parentId: "l_praca" });
    expect(screen.getByRole("dialog", { name: "Edytuj etykietę Lokalna" })).toBeInTheDocument();
  });

  it("creates folders and reports a folder that is not empty", async () => {
    const { mail, user } = setup("/u/0/settings/labels", (m) => {
      labelsOf(m);
      m.state.threads[0]!.labelIds = [...(m.state.threads[0]!.labelIds ?? []), "l_arch"];
    });
    await screen.findByRole("listitem", { name: "Stare" });
    await user.click(screen.getByRole("button", { name: "Nowy folder" }));
    const dialog = await screen.findByRole("dialog", { name: "Nowy folder" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nazwa" }), "Projekty 2026");
    await user.click(within(dialog).getByRole("button", { name: "Utwórz" }));
    await waitFor(() =>
      expect(mail.state.calls.labelsCreate).toEqual([
        { accountId: "acc_1", name: "Projekty 2026", type: "folder" },
      ]),
    );

    await user.click(screen.getByRole("button", { name: "Usuń Stare" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Usunąć folder „Stare”?" });
    await user.click(within(confirm).getByRole("button", { name: "Usuń" }));
    expect(await screen.findByText(/Folder nie jest pusty/)).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Stare" })).toBeInTheDocument();
  });

  it("refetches the labels on label.changed", async () => {
    const { mail } = setup("/u/0/settings/labels", labelsOf);
    await screen.findByRole("listitem", { name: "Praca" });
    mail.state.extraLabels.push(mail.makeLabel("l_nowa", "Z innej karty"));
    act(() =>
      FakeEventSource.latest().emit("label.changed", { accountId: "acc_1", labelId: "l_nowa" }),
    );
    expect(await screen.findByRole("listitem", { name: "Z innej karty" })).toBeInTheDocument();
  });
});

describe("filters", () => {
  const withFilters = (m: Mail) => {
    labelsOf(m);
    const base = {
      accountId: "acc_1",
      enabled: true,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      actions: {
        archive: false,
        markRead: false,
        star: false,
        important: false,
        trash: false,
        addLabelIds: [] as string[],
        forwardTo: null,
      },
    };
    m.state.filters = [
      {
        ...base,
        id: "f_a",
        name: "Newslettery",
        criteria: "from:news@x.com",
        criteriaNormalized: "from:news@x.com",
        position: 0,
        actions: { ...base.actions, archive: true, addLabelIds: ["l_praca"] },
      },
      {
        ...base,
        id: "f_b",
        name: "",
        criteria: "subject:faktura",
        criteriaNormalized: "subject:faktura",
        position: 1,
        actions: { ...base.actions, star: true },
      },
    ];
  };

  it("lists filters with their actions; enabling and moving are a PUT of the whole filter", async () => {
    const { mail, user } = setup("/u/0/settings/filters", withFilters);
    const list = await screen.findByRole("list", { name: "Filtry" });
    const first = await within(list).findByRole("listitem", { name: "Newslettery" });
    expect(first).toHaveTextContent("archiwizuj, etykieta Praca");
    await user.click(within(first).getByRole("checkbox", { name: "Filtr Newslettery włączony" }));
    await waitFor(() =>
      expect(mail.state.calls.filtersPut).toEqual([
        {
          id: "f_a",
          accountId: "acc_1",
          name: "Newslettery",
          criteria: "from:news@x.com",
          enabled: false,
          position: 0,
          actions: {
            archive: true,
            markRead: false,
            star: false,
            important: false,
            trash: false,
            addLabelIds: ["l_praca"],
          },
        },
      ]),
    );
    await user.click(within(first).getByRole("button", { name: "Przesuń niżej: Newslettery" }));
    await waitFor(() =>
      expect(mail.state.calls.filtersPut[1]).toMatchObject({ id: "f_a", position: 1 }),
    );
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole("listitem")
          .map((li) => li.getAttribute("aria-label")),
      ).toEqual(["subject:faktura", "Newslettery"]),
    );
  });

  it("joins the fields into criteria, saves the actions and applies to existing mail", async () => {
    const { mail, user } = setup("/u/0/settings/filters", labelsOf);
    await user.click(await screen.findByRole("button", { name: "Utwórz nowy filtr" }));
    const dialog = await screen.findByRole("dialog", { name: "Utwórz nowy filtr" });
    await user.type(within(dialog).getByRole("textbox", { name: "Nazwa filtru" }), "Faktury");
    await user.type(within(dialog).getByRole("textbox", { name: "Od" }), "biuro@firma.pl");
    await user.type(within(dialog).getByRole("textbox", { name: "Temat" }), "faktura VAT");
    await user.click(within(dialog).getByRole("checkbox", { name: "Ma załącznik" }));
    expect(within(dialog).getByLabelText("Kryteria", { selector: "p" })).toHaveTextContent(
      'from:biuro@firma.pl subject:"faktura VAT" has:attachment',
    );
    await user.click(within(dialog).getByRole("checkbox", { name: "Oznacz jako przeczytane" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Praca" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Przekaż do" }),
      "ksiegowa@firma.pl",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Zastosuj też do pasujących wątków" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Zapisz filtr" }));

    await waitFor(() =>
      expect(mail.state.calls.filtersCreate).toEqual([
        {
          accountId: "acc_1",
          name: "Faktury",
          criteria: 'from:biuro@firma.pl subject:"faktura VAT" has:attachment',
          enabled: true,
          actions: {
            archive: false,
            markRead: true,
            star: false,
            important: false,
            trash: false,
            addLabelIds: ["l_praca"],
            forwardTo: "ksiegowa@firma.pl",
          },
        },
      ]),
    );
    await waitFor(() => expect(mail.state.calls.filtersApply).toEqual(["f_1"]));
    expect(await screen.findByText("Stosowanie filtru do ok. 12 wiadomości…")).toBeInTheDocument();
    expect(await screen.findByRole("listitem", { name: "Faktury" })).toBeInTheDocument();

    act(() =>
      FakeEventSource.latest().emit("filter.applied", {
        filterId: "f_1",
        accountId: "acc_1",
        messages: 14,
        threads: 9,
      }),
    );
    expect(await screen.findByText("Filtr zastosowano do 9 wątków.")).toBeInTheDocument();
  });

  it("shows 422 invalid_query at the criteria field", async () => {
    const { mail, user } = setup("/u/0/settings/filters");
    await user.click(await screen.findByRole("button", { name: "Utwórz nowy filtr" }));
    const dialog = await screen.findByRole("dialog", { name: "Utwórz nowy filtr" });
    await user.click(within(dialog).getByRole("button", { name: "Edytuj jako tekst" }));
    const text = within(dialog).getByRole("textbox", { name: "Kryteria (składnia wyszukiwania)" });
    await user.type(text, "a) from:x");
    await user.click(within(dialog).getByRole("checkbox", { name: "Oznacz gwiazdką" }));
    await user.click(within(dialog).getByRole("button", { name: "Zapisz filtr" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Nieprawidłowe kryteria");
    expect(text).toHaveAttribute("aria-invalid", "true");
    expect(text).toHaveAccessibleDescription(/Nieprawidłowe kryteria/);
    expect(mail.state.calls.filtersCreate).toHaveLength(1);
    expect(dialog).toBeInTheDocument();
  });

  it("opens the editor with ?criteria= from the search box", async () => {
    const { user, router } = setup("/u/0/inbox");
    await screen.findByRole("grid");
    await user.type(screen.getByRole("combobox", { name: "Szukaj w poczcie" }), "from:jan");
    await user.click(screen.getByRole("button", { name: "Pokaż opcje wyszukiwania" }));
    const form = await screen.findByRole("dialog", { name: "Wyszukiwanie zaawansowane" });
    await user.click(within(form).getByRole("button", { name: "Utwórz filtr" }));
    const dialog = await screen.findByRole("dialog", { name: "Utwórz nowy filtr" });
    expect(router.state.location.pathname).toBe("/u/0/settings/filters");
    expect(
      within(dialog).getByRole("textbox", { name: "Kryteria (składnia wyszukiwania)" }),
    ).toHaveValue("from:jan");
  });

  it("tests the criteria in the search and removes a filter after confirming", async () => {
    const { mail, user, router } = setup("/u/0/settings/filters", withFilters);
    const row = await screen.findByRole("listitem", { name: "subject:faktura" });
    await user.click(within(row).getByRole("button", { name: "Usuń filtr subject:faktura" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Usuń" }));
    await waitFor(() => expect(mail.state.calls.filtersDelete).toEqual(["f_b"]));

    const first = await screen.findByRole("listitem", { name: "Newslettery" });
    await user.click(within(first).getByRole("button", { name: "Edytuj filtr Newslettery" }));
    const dialog = await screen.findByRole("dialog", { name: "Edytuj filtr Newslettery" });
    await user.click(within(dialog).getByRole("button", { name: "Testuj kryteria" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/search"));
    expect(router.state.location.search).toEqual({ q: "from:news@x.com" });
  });
});

describe("accounts", () => {
  it("rebuilds the cache after confirming", async () => {
    const { mail, user } = setup("/u/0/settings/accounts");
    const row = await screen.findByRole("listitem", { name: "dev1@silo.test" });
    expect(
      await within(row).findByText(/Etykiety jako słowa kluczowe IMAP: obsługiwane/),
    ).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Odbuduj cache" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Odbudować cache konta dev1@silo.test?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Odbuduj cache" }));
    expect(await screen.findByText("Odbudowa cache rozpoczęta.")).toBeInTheDocument();
    expect(mail.state.calls.resync).toEqual([{ id: "acc_1", mode: "rebuild" }]);
  });

  it("explains 409 rebuild_blocked", async () => {
    const { user } = setup("/u/0/settings/accounts", (m) => {
      m.state.resyncProblem = { status: 409, code: "rebuild_blocked" };
    });
    const row = await screen.findByRole("listitem", { name: "dev1@silo.test" });
    await user.click(within(row).getByRole("button", { name: "Odbuduj cache" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Odbuduj cache" }),
    );
    expect(await within(row).findByRole("alert")).toHaveTextContent(/Nie można teraz odbudować/);
  });
});
