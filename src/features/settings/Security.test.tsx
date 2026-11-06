import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLocalMock } from "../../test/mockLocal";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

/** Ustawienia → Bezpieczeństwo (mode local): password, TOTP, backup codes, sessions. */

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(opts: { local?: boolean; totp?: boolean } = {}) {
  const mail = createMockMail();
  server.use(...mail.handlers);
  const local = opts.local === false ? null : createLocalMock(mail);
  if (local) server.use(...local.handlers);
  mail.session.user.totpEnabled = opts.totp ?? false;
  const user = userEvent.setup();
  return { mail, local: local!, user, ...renderApp("/u/0/settings/security") };
}

describe("mode imap", () => {
  it("hides the tab and explains the URL", async () => {
    setup({ local: false });
    expect(await screen.findByText(/Niedostępne w tym trybie/)).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Ustawienia" });
    expect(within(tabs).queryByRole("link", { name: "Bezpieczeństwo" })).not.toBeInTheDocument();
  });
});

describe("password", () => {
  it("checks the new password locally, then 403 and success", async () => {
    const { local, user } = setup();
    const form = await screen.findByRole("form", { name: "Zmień hasło" });
    expect(
      within(screen.getByRole("navigation", { name: "Ustawienia" })).getByRole("link", {
        name: "Bezpieczeństwo",
      }),
    ).toHaveAttribute("aria-current", "page");

    await user.type(within(form).getByLabelText("Bieżące hasło"), "zle-haslo");
    await user.type(within(form).getByLabelText("Nowe hasło"), "krotkie");
    await user.type(within(form).getByLabelText("Powtórz nowe hasło"), "krotkie");
    await user.click(within(form).getByRole("button", { name: "Zmień hasło" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("co najmniej 10 znaków");
    expect(local.state.calls.changePassword).toEqual([]);

    await user.clear(within(form).getByLabelText("Nowe hasło"));
    await user.clear(within(form).getByLabelText("Powtórz nowe hasło"));
    await user.type(within(form).getByLabelText("Nowe hasło"), "nowe-haslo-123");
    await user.type(within(form).getByLabelText("Powtórz nowe hasło"), "nowe-haslo-123");
    await user.click(within(form).getByRole("button", { name: "Zmień hasło" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Nieprawidłowe hasło.");

    await user.clear(within(form).getByLabelText("Bieżące hasło"));
    await user.type(within(form).getByLabelText("Bieżące hasło"), "devpass1");
    await user.click(within(form).getByRole("button", { name: "Zmień hasło" }));
    expect(
      await within(form).findByText("Hasło zmienione. Inne sesje zostały wylogowane."),
    ).toBeInTheDocument();
    expect(local.state.calls.changePassword.at(-1)).toEqual({
      currentPassword: "devpass1",
      newPassword: "nowe-haslo-123",
    });
    expect(within(form).getByLabelText("Bieżące hasło")).toHaveValue("");
    // The other sessions are gone from the list.
    await waitFor(() => expect(screen.getByText("Brak innych sesji.")).toBeInTheDocument());
  });
});

describe("TOTP", () => {
  it("enables TOTP with a QR code, 422 under the field, backup codes shown once", async () => {
    const { local, mail, user } = setup();
    expect(await screen.findByTestId("totp-state")).toHaveTextContent("Wyłączona");
    await user.click(screen.getByRole("button", { name: "Włącz weryfikację dwuetapową" }));

    expect(
      await screen.findByRole("img", { name: "Kod QR do aplikacji uwierzytelniającej" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("totp-secret")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");
    const code = screen.getByLabelText("Kod z aplikacji");
    expect(code).toHaveAttribute("inputmode", "numeric");

    await user.type(code, "999999");
    await user.click(screen.getByRole("button", { name: "Włącz" }));
    const error = await screen.findByText(/Nieprawidłowy kod/);
    expect(code).toHaveAttribute("aria-describedby", error.id);
    expect(code).toHaveAttribute("aria-invalid", "true");

    await user.clear(code);
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: "Włącz" }));
    const dialog = await screen.findByRole("dialog", { name: "Kody zapasowe" });
    const list = within(dialog).getByRole("list", { name: "Lista kodów zapasowych" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(local.state.newBackupCodes);
    expect(local.state.calls.totpEnable).toEqual(["999999", "123456"]);
    expect(mail.session.user.totpEnabled).toBe(true);

    // Closing needs "Zapisałem kody"; Esc does nothing before that.
    const done = within(dialog).getByRole("button", { name: "Gotowe" });
    expect(done).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Kody zapasowe" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "Zapisałem kody" }));
    await user.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // GET /session again: the state follows user.totpEnabled.
    expect(await screen.findByTestId("totp-state")).toHaveTextContent("Włączona");
    expect(screen.queryByText("k1k1k1k1k1")).not.toBeInTheDocument();
  });

  it("disables TOTP with password and code (403 first)", async () => {
    const { local, mail, user } = setup({ totp: true });
    await user.click(await screen.findByRole("button", { name: "Wyłącz" }));
    const dialog = await screen.findByRole("dialog", { name: "Wyłączyć weryfikację dwuetapową?" });
    expect(within(dialog).getByLabelText("Hasło")).toHaveFocus();
    await user.type(within(dialog).getByLabelText("Hasło"), "devpass1");
    await user.type(within(dialog).getByLabelText("Kod z aplikacji lub zapasowy"), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Wyłącz" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Nieprawidłowe hasło lub kod.",
    );
    await user.clear(within(dialog).getByLabelText("Kod z aplikacji lub zapasowy"));
    await user.type(within(dialog).getByLabelText("Kod z aplikacji lub zapasowy"), "123456");
    await user.click(within(dialog).getByRole("button", { name: "Wyłącz" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByTestId("totp-state")).toHaveTextContent("Wyłączona");
    expect(mail.session.user.totpEnabled).toBe(false);
    expect(local.state.calls.totpDisable.at(-1)).toEqual({ password: "devpass1", code: "123456" });
  });

  it("regenerates the backup codes", async () => {
    const { local, user } = setup({ totp: true });
    await user.click(await screen.findByRole("button", { name: "Wygeneruj nowe kody zapasowe" }));
    const dialog = await screen.findByRole("dialog", { name: "Nowe kody zapasowe" });
    await user.type(within(dialog).getByLabelText("Hasło"), "devpass1");
    await user.type(within(dialog).getByLabelText("Kod z aplikacji lub zapasowy"), "abcde12345");
    await user.click(within(dialog).getByRole("button", { name: "Potwierdź" }));
    const codes = await screen.findByRole("dialog", { name: "Kody zapasowe" });
    expect(within(codes).getByText("n1n1n1n1n1")).toBeInTheDocument();
    expect(local.state.calls.backupCodes).toEqual([{ password: "devpass1", code: "abcde12345" }]);
  });
});

describe("sessions", () => {
  it("lists the sessions and signs out one and all others", async () => {
    const { local, user } = setup();
    const table = await screen.findByRole("table", { name: "Zalogowane urządzenia" });
    expect(within(table).getByText("Chrome · Windows")).toBeInTheDocument();
    expect(within(table).getByText("To urządzenie")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "Wyloguj: Pixel 8" }));
    await waitFor(() => expect(local.state.calls.revoke).toEqual(["s_3"]));
    await waitFor(() => expect(within(table).queryByText("Pixel 8")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Wyloguj wszędzie indziej" }));
    await waitFor(() => expect(local.state.calls.revoke).toEqual(["s_3", "s_2"]));
    expect(await screen.findByText("Brak innych sesji.")).toBeInTheDocument();
  });
});
