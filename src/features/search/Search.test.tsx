import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildQuery, emptyAdvanced, splitQuery, withoutPart } from "../../lib/searchText";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(url = "/u/0/inbox", prepare?: (mail: ReturnType<typeof createMockMail>) => void) {
  const mail = createMockMail();
  prepare?.(mail);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  const app = renderApp(url);
  return { mail, user, ...app };
}

const box = () => screen.getByRole("combobox", { name: "Szukaj w poczcie" });
const searchUrl = (q: string) => `/u/0/search?q=${encodeURIComponent(q)}`;

describe("search text helpers (no parser)", () => {
  it("splits at spaces outside quotes and brackets and removes one part", () => {
    const q = 'from:jan "umowa najmu" (a OR b) -{x y} słowo';
    expect(splitQuery(q)).toEqual(["from:jan", '"umowa najmu"', "(a OR b)", "-{x y}", "słowo"]);
    expect(withoutPart(q, 1)).toBe("from:jan (a OR b) -{x y} słowo");
  });

  it("joins the advanced fields into the query text", () => {
    expect(
      buildQuery({
        ...emptyAdvanced,
        from: "jan@firma.pl",
        subject: "umowa najmu",
        notWords: "spam reklama",
        hasAttachment: true,
        size: "5",
        sizeOp: "smaller",
        after: "2026-11-01",
        searchIn: "in:inbox",
      }),
    ).toBe(
      'from:jan@firma.pl subject:"umowa najmu" -{spam reklama} has:attachment smaller:5M after:2026/11/01 in:inbox',
    );
  });
});

it("shows the history on focus, grouped, and forgets one query or all of them", async () => {
  const { mail, user } = setup();
  await screen.findByRole("grid");
  await user.click(box());

  const list = await screen.findByRole("listbox", { name: "Podpowiedzi wyszukiwania" });
  const recent = await within(list).findByRole("group", { name: "Ostatnie" });
  expect(
    within(recent)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["faktura", "from:jan@firma.pl"]);
  expect(box()).toHaveAttribute("aria-expanded", "true");

  await user.click(screen.getByRole("button", { name: "Usuń z historii: faktura" }));
  await waitFor(() => expect(within(list).queryByRole("option", { name: "faktura" })).toBeNull());
  expect(mail.state.calls.deleteHistory).toEqual(["faktura"]);
  // The field keeps the focus: the list stays open.
  expect(box()).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Wyczyść historię" }));
  await waitFor(() => expect(mail.state.calls.deleteHistory).toEqual(["faktura", null]));
  await waitFor(() => expect(box()).toHaveAttribute("aria-expanded", "false"));
});

it("accepting a suggestion puts its text in the field (keyboard and mouse)", async () => {
  const { mail, user } = setup();
  await screen.findByRole("grid");
  await user.click(box());
  await user.type(box(), "Temat is:u");

  const ops = await screen.findByRole("group", { name: "Operatory" });
  expect(within(ops).getByRole("option", { name: "is:unread" })).toBeInTheDocument();
  // Typed text is sent as is; nothing is parsed in the browser.
  expect(mail.state.calls.suggest.at(-1)).toBe("Temat is:u");

  await user.keyboard("{ArrowDown}");
  const first = screen.getAllByRole("option")[0]!;
  expect(first).toHaveAttribute("aria-selected", "true");
  expect(box()).toHaveAttribute("aria-activedescendant", first.id);
  await user.keyboard("{Enter}");
  expect(box()).toHaveValue("Temat is:unread");
  // Accepting does not search yet.
  expect(mail.state.calls.searches).toEqual([]);

  await user.clear(box());
  await user.type(box(), "jan");
  const contacts = await screen.findByRole("group", { name: "Kontakty" });
  await user.click(within(contacts).getByRole("option", { name: "Jan Kowalski <jan@firma.pl>" }));
  expect(box()).toHaveValue("from:jan@firma.pl");
});

it("Enter searches with q in the URL; a history entry searches at once", async () => {
  const { mail, user, router } = setup();
  await screen.findByRole("grid");
  await user.click(box());
  await user.type(box(), "Temat 3{Enter}");

  await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/search"));
  expect(router.state.location.search).toEqual({ q: "Temat 3" });
  expect(await screen.findByRole("row", { name: /Temat 3/ })).toBeInTheDocument();
  expect(screen.getAllByRole("row")).toHaveLength(1);
  expect(mail.state.calls.searches).toEqual([{ q: "Temat 3", labelId: null }]);
  expect(box()).not.toHaveFocus();

  await user.click(box());
  await user.clear(box());
  await user.click(await screen.findByRole("option", { name: "faktura" }));
  await waitFor(() => expect(router.state.location.search).toEqual({ q: "faktura" }));
});

it("shows the indexing progress and the result estimate", async () => {
  setup(searchUrl("Temat"), (mail) => {
    mail.state.searchExtra = { indexing: { done: 0.62 }, resultSizeEstimate: 2000 };
  });
  expect(
    await screen.findByText("Indeksowanie treści: 62% – wyniki mogą być niepełne"),
  ).toBeInTheDocument();
  expect(screen.getByText("2000+ wyników")).toBeInTheDocument();
  expect(screen.getByText(/Indeksowanie treści/).closest("[aria-live]")).toHaveAttribute(
    "aria-live",
    "polite",
  );
});

it("says when the search ran out of time (approximate)", async () => {
  setup(searchUrl("Temat"), (mail) => {
    mail.state.searchExtra = { approximate: true, indexing: { done: 1 } };
  });
  expect(
    await screen.findByText("Wyszukiwanie trwało zbyt długo – uprość zapytanie"),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Indeksowanie treści/)).toBeNull();
});

it("shows 422 invalid_query under the field instead of a load error", async () => {
  setup(searchUrl("faktura)"));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Nieprawidłowe zapytanie");
  expect(box()).toHaveAttribute("aria-invalid", "true");
  expect(box()).toHaveAccessibleDescription(/Nieprawidłowe zapytanie/);
  expect(screen.queryByText("Nie udało się wczytać listy.")).toBeNull();
});

it("shows the query as chips; removing one removes that text from q", async () => {
  const { user, router } = setup(searchUrl('from:jan "umowa najmu" Temat'));
  const chips = await screen.findByRole("list", { name: "Elementy zapytania" });
  expect(
    within(chips)
      .getAllByRole("listitem")
      .map((li) => li.textContent),
  ).toEqual(["from:jan", '"umowa najmu"', "Temat"]);
  await user.click(within(chips).getByRole("button", { name: "Usuń z zapytania: from:jan" }));
  await waitFor(() => expect(router.state.location.search).toEqual({ q: '"umowa najmu" Temat' }));
  expect(box()).toHaveValue('"umowa najmu" Temat');
});

it("the advanced search joins its fields into q", async () => {
  const { user, router } = setup();
  await screen.findByRole("grid");
  await user.click(screen.getByRole("button", { name: "Pokaż opcje wyszukiwania" }));
  const form = await screen.findByRole("dialog", { name: "Wyszukiwanie zaawansowane" });

  await user.type(within(form).getByRole("textbox", { name: "Od" }), "jan@firma.pl");
  await user.type(within(form).getByRole("textbox", { name: "Temat" }), "umowa najmu");
  await user.click(within(form).getByRole("checkbox", { name: "Ma załącznik" }));
  fireEvent.change(within(form).getByLabelText("Po dniu"), { target: { value: "2026-11-01" } });
  await user.selectOptions(within(form).getByRole("combobox", { name: "Szukaj w" }), "in:inbox");
  expect(within(form).getByRole("button", { name: "Utwórz filtr" })).toBeEnabled();
  await user.click(within(form).getByRole("button", { name: "Szukaj" }));

  await waitFor(() =>
    expect(router.state.location.search).toEqual({
      q: 'from:jan@firma.pl subject:"umowa najmu" has:attachment after:2026/11/01 in:inbox',
    }),
  );
});

it("list shortcuts do not fire while typing in the search box; Esc leaves it", async () => {
  const { mail, user } = setup();
  await screen.findByRole("row", { name: /Temat 5/ });
  await user.click(box());
  await user.keyboard("bes");
  expect(box()).toHaveValue("bes");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(mail.state.calls.modify).toEqual([]);
  expect(mail.state.calls.snooze).toEqual([]);

  await user.keyboard("{Escape}");
  expect(box()).not.toHaveFocus();
  // `/` focuses the field again.
  await user.keyboard("/");
  expect(box()).toHaveFocus();
});
