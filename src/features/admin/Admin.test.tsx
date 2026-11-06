import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAdminMock } from "../../test/mockAdmin";
import { createLocalMock } from "../../test/mockLocal";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

/** Administracja: users, accounts and jobs (plan 5.1 /admin/*, 5.7). */

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(url: string, opts: { local?: boolean; admin?: boolean; forbidden?: boolean } = {}) {
  const mail = createMockMail();
  server.use(...mail.handlers);
  if (opts.local) server.use(...createLocalMock(mail).handlers);
  const admin = createAdminMock(mail);
  server.use(...admin.handlers);
  mail.session.user.isAdmin = opts.admin ?? true;
  admin.state.forbidden = opts.forbidden ?? false;
  const user = userEvent.setup();
  return { mail, admin, user, ...renderApp(url) };
}

describe("access", () => {
  it("non-admin: no menu entry and the page says Brak uprawnień", async () => {
    const { user } = setup("/u/0/inbox", { admin: false });
    await user.click(await screen.findByRole("button", { name: /dev1@silo.test/ }));
    expect(await screen.findByRole("menuitem", { name: "Zarządzaj kontami" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Administracja" })).not.toBeInTheDocument();
  });

  it("non-admin: the URL shows Brak uprawnień without asking the server", async () => {
    const { admin } = setup("/u/0/admin/jobs", { admin: false });
    expect(await screen.findByText("Brak uprawnień")).toBeInTheDocument();
    expect(admin.state.calls.jobsQuery).toEqual([]);
  });

  it("a 403 forbidden of the server shows Brak uprawnień", async () => {
    setup("/u/0/admin/users", { forbidden: true });
    expect(await screen.findByText("Brak uprawnień")).toBeInTheDocument();
  });

  it("admin: Administracja in the account menu opens the users", async () => {
    const { user, router } = setup("/u/0/inbox");
    await user.click(await screen.findByRole("button", { name: /dev1@silo.test/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Administracja" }));
    expect(await screen.findByRole("table", { name: "Użytkownicy" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/u/0/admin/users");
  });
});

describe("users", () => {
  it("lists users with their accounts and states", async () => {
    setup("/u/0/admin/users");
    const table = await screen.findByRole("table", { name: "Użytkownicy" });
    const ala = within(table).getByRole("row", { name: /ala@silo.test/ });
    expect(within(ala).getByText("ala@example.com")).toBeInTheDocument();
    expect(within(ala).getByText("Błąd logowania")).toHaveAttribute("data-state", "auth_failed");
    // Mode imap: users appear at their first sign-in, nobody is added here.
    expect(screen.queryByRole("button", { name: "Dodaj użytkownika" })).not.toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "E-mail",
      "Nazwa",
      "Administrator",
      "Zablokowany",
      "TOTP",
      "Konta",
      "Utworzono",
      "Akcje",
    ]);
  });

  it("mode local: adds a user and shows the temporary password once", async () => {
    const { admin, user } = setup("/u/0/admin/users", { local: true });
    await user.click(await screen.findByRole("button", { name: "Dodaj użytkownika" }));
    const dialog = await screen.findByRole("dialog", { name: "Dodaj użytkownika" });
    expect(within(dialog).getByLabelText("E-mail")).toHaveFocus();
    await user.type(within(dialog).getByLabelText("E-mail"), "nowy@silo.test");
    await user.type(within(dialog).getByLabelText("Nazwa wyświetlana (opcjonalnie)"), "Nowy");
    await user.click(within(dialog).getByRole("button", { name: "Dodaj" }));

    const temp = await screen.findByRole("dialog", { name: "Hasło tymczasowe" });
    expect(within(temp).getByLabelText("Hasło tymczasowe")).toHaveTextContent("Tymczasowe-1234");
    expect(admin.state.calls.create).toEqual([
      { email: "nowy@silo.test", displayName: "Nowy", isAdmin: false },
    ]);
    await user.click(within(temp).getByRole("button", { name: "Gotowe" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Tymczasowe-1234")).not.toBeInTheDocument();
    expect(
      await within(screen.getByRole("table")).findByRole("row", { name: /nowy@silo.test/ }),
    ).toBeInTheDocument();
  });

  it("mode local: user_exists is shown in the dialog", async () => {
    const { user } = setup("/u/0/admin/users", { local: true });
    await user.click(await screen.findByRole("button", { name: "Dodaj użytkownika" }));
    const dialog = await screen.findByRole("dialog", { name: "Dodaj użytkownika" });
    await user.type(within(dialog).getByLabelText("E-mail"), "ala@silo.test");
    await user.type(within(dialog).getByLabelText("Hasło (opcjonalnie)"), "dlugie-haslo-1");
    await user.click(within(dialog).getByRole("button", { name: "Dodaj" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("już istnieje");
  });

  it("blocks a user, refuses a self change with its message", async () => {
    const { admin, user } = setup("/u/0/admin/users");
    await user.click(await screen.findByRole("button", { name: "Akcje: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Zablokuj" }));
    await waitFor(() => expect(admin.state.calls.patch).toEqual([{ id: "u_2", disabled: true }]));
    const ala = await screen.findByRole("row", { name: /ala@silo.test/ });
    await waitFor(() => expect(within(ala).getAllByText("tak")).toHaveLength(2));

    // The admin's own row has the self-changing actions disabled.
    await user.click(screen.getByRole("button", { name: "Akcje: dev1@silo.test" }));
    expect(await screen.findByRole("menuitem", { name: "Zablokuj" })).toHaveAttribute(
      "data-disabled",
    );
  });

  it("409 admin_self_change shows its message", async () => {
    const { admin, user } = setup("/u/0/admin/users");
    // E.g. the last admin demoting a peer the server counts as itself.
    server.use(
      http.patch("*/api/v1/admin/users/:id", () => {
        admin.state.calls.patch.push({ id: "u_2" });
        return HttpResponse.json({ status: 409, code: "admin_self_change" }, { status: 409 });
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Akcje: ala@silo.test" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Nadaj uprawnienia administratora" }),
    );
    await waitFor(() => expect(admin.state.calls.patch).toHaveLength(1));
    expect(
      await screen.findByText(
        "Nie możesz zablokować, usunąć ani odebrać uprawnień własnemu kontu.",
      ),
    ).toBeInTheDocument();
  });

  it("resets TOTP and the password, deletes after typing the address", async () => {
    const { admin, user } = setup("/u/0/admin/users", { local: true });
    await user.click(await screen.findByRole("button", { name: "Akcje: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Zresetuj TOTP" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Zresetuj TOTP" }),
    );
    await waitFor(() => expect(admin.state.calls.totpReset).toEqual(["u_2"]));

    await user.click(screen.getByRole("button", { name: "Akcje: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Zresetuj hasło" }));
    const pw = await screen.findByRole("dialog", { name: "Nowe hasło dla ala@silo.test" });
    await user.click(within(pw).getByRole("button", { name: "Wygeneruj" }));
    const generated = (within(pw).getByLabelText("Nowe hasło") as HTMLInputElement).value;
    expect(generated).toHaveLength(16);
    await user.click(within(pw).getByRole("button", { name: "Ustaw hasło" }));
    await waitFor(() =>
      expect(admin.state.calls.patch).toEqual([{ id: "u_2", password: generated }]),
    );

    await user.click(screen.getByRole("button", { name: "Akcje: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Usuń" }));
    const del = await screen.findByRole("dialog", { name: "Usunąć użytkownika ala@silo.test?" });
    const confirm = within(del).getByRole("button", { name: "Usuń" });
    expect(confirm).toBeDisabled();
    await user.type(
      within(del).getByLabelText("Wpisz ala@silo.test, aby potwierdzić"),
      "ala@silo.test",
    );
    await user.click(confirm);
    await waitFor(() => expect(admin.state.calls.deleteUser).toEqual(["u_2"]));
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /ala@silo.test/ })).not.toBeInTheDocument(),
    );
  });
});

describe("accounts", () => {
  it("lists every account; dead operations link to the jobs of the account", async () => {
    const { user, router } = setup("/u/0/admin/accounts");
    const table = await screen.findByRole("table", { name: "Konta" });
    const row = within(table).getByRole("row", { name: /ala@example.com/ });
    expect(within(row).getByText("imap.example.com")).toBeInTheDocument();
    expect(within(row).getByText("AUTHENTICATIONFAILED")).toBeInTheDocument();
    expect(within(row).getByText("nigdy")).toBeInTheDocument();
    await user.click(
      within(row).getByRole("link", { name: "Nieudane operacje konta ala@example.com: 2" }),
    );
    expect(await screen.findByRole("table", { name: "Zadania: Nieudane" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ status: "dead", accountId: "acc_2" });
  });
});

describe("jobs", () => {
  it("shows dead jobs by default, filters pending, retries and discards with confirmation", async () => {
    const { admin, user } = setup("/u/0/admin/jobs");
    const table = await screen.findByRole("table", { name: "Zadania: Nieudane" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(admin.state.calls.jobsQuery[0]).toBe("?status=dead");
    const first = within(table).getByRole("row", { name: /job_1/ });
    const error = within(first).getByTitle(/^NO \[TRYCREATE\]/);
    expect(error.textContent!.endsWith("…")).toBe(true);
    expect(within(first).getByText("ala@example.com (ala@silo.test)")).toBeInTheDocument();
    expect(within(first).getByText("8/8")).toBeInTheDocument();

    await user.click(within(first).getByRole("button", { name: "Ponów job_1" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Ponowić zadanie job_1?" });
    await user.click(within(dialog).getByRole("button", { name: "Ponów" }));
    await waitFor(() => expect(admin.state.calls.retry).toEqual(["job_1"]));
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /job_1/ })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Usuń job_2" }));
    const discard = await screen.findByRole("alertdialog", { name: "Usunąć zadanie job_2?" });
    await user.click(within(discard).getByRole("button", { name: "Usuń" }));
    await waitFor(() => expect(admin.state.calls.deleteJob).toEqual(["job_2"]));
    expect(await screen.findByText("Brak zadań.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Stan"), "pending");
    const pending = await screen.findByRole("table", { name: "Zadania: Oczekujące" });
    expect(within(pending).getByText("cała instancja")).toBeInTheDocument();
    expect(admin.state.calls.jobsQuery).toContain("?status=pending");

    await user.selectOptions(screen.getByLabelText("Konto"), "acc_2");
    await waitFor(() =>
      expect(admin.state.calls.jobsQuery).toContain("?status=pending&accountId=acc_2"),
    );
  });
});
