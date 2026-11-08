import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createLocalMock } from "../../test/mockLocal";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

/** Settings → Security (mode local): password, TOTP, backup codes, sessions. */

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
    expect(await screen.findByText(/Not available in this mode/)).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Settings" });
    expect(within(tabs).queryByRole("link", { name: "Security" })).not.toBeInTheDocument();
  });
});

describe("password", () => {
  it("checks the new password locally, then 403 and success", async () => {
    const { local, user } = setup();
    const form = await screen.findByRole("form", { name: "Change password" });
    expect(
      within(screen.getByRole("navigation", { name: "Settings" })).getByRole("link", {
        name: "Security",
      }),
    ).toHaveAttribute("aria-current", "page");

    await user.type(within(form).getByLabelText("Current password"), "zle-haslo");
    await user.type(within(form).getByLabelText("New password"), "krotkie");
    await user.type(within(form).getByLabelText("Confirm new password"), "krotkie");
    await user.click(within(form).getByRole("button", { name: "Change password" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("at least 10 characters");
    expect(local.state.calls.changePassword).toEqual([]);

    await user.clear(within(form).getByLabelText("New password"));
    await user.clear(within(form).getByLabelText("Confirm new password"));
    await user.type(within(form).getByLabelText("New password"), "nowe-haslo-123");
    await user.type(within(form).getByLabelText("Confirm new password"), "nowe-haslo-123");
    await user.click(within(form).getByRole("button", { name: "Change password" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Wrong password.");

    await user.clear(within(form).getByLabelText("Current password"));
    await user.type(within(form).getByLabelText("Current password"), "devpass1");
    await user.click(within(form).getByRole("button", { name: "Change password" }));
    expect(
      await within(form).findByText("Password changed. Other sessions were signed out."),
    ).toBeInTheDocument();
    expect(local.state.calls.changePassword.at(-1)).toEqual({
      currentPassword: "devpass1",
      newPassword: "nowe-haslo-123",
    });
    expect(within(form).getByLabelText("Current password")).toHaveValue("");
    // The other sessions are gone from the list.
    await waitFor(() => expect(screen.getByText("No other sessions.")).toBeInTheDocument());
  });
});

describe("TOTP", () => {
  it("enables TOTP with a QR code, 422 under the field, backup codes shown once", async () => {
    const { local, mail, user } = setup();
    expect(await screen.findByTestId("totp-state")).toHaveTextContent("Off");
    await user.click(screen.getByRole("button", { name: "Turn on 2-Step Verification" }));

    expect(
      await screen.findByRole("img", { name: "QR code for the authenticator app" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("totp-secret")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");
    const code = screen.getByLabelText("App code");
    expect(code).toHaveAttribute("inputmode", "numeric");

    await user.type(code, "999999");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    const error = await screen.findByText(/Wrong code/);
    expect(code).toHaveAttribute("aria-describedby", error.id);
    expect(code).toHaveAttribute("aria-invalid", "true");

    await user.clear(code);
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    const dialog = await screen.findByRole("dialog", { name: "Backup codes" });
    const list = within(dialog).getByRole("list", { name: "List of backup codes" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(local.state.newBackupCodes);
    expect(local.state.calls.totpEnable).toEqual(["999999", "123456"]);
    expect(mail.session.user.totpEnabled).toBe(true);

    // Closing needs "I saved the codes"; Esc does nothing before that.
    const done = within(dialog).getByRole("button", { name: "Done" });
    expect(done).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Backup codes" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "I saved the codes" }));
    await user.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // GET /session again: the state follows user.totpEnabled.
    expect(await screen.findByTestId("totp-state")).toHaveTextContent("On");
    expect(screen.queryByText("k1k1k1k1k1")).not.toBeInTheDocument();
  });

  it("disables TOTP with password and code (403 first)", async () => {
    const { local, mail, user } = setup({ totp: true });
    await user.click(await screen.findByRole("button", { name: "Turn off" }));
    const dialog = await screen.findByRole("dialog", { name: "Turn off 2-Step Verification?" });
    expect(within(dialog).getByLabelText("Password")).toHaveFocus();
    await user.type(within(dialog).getByLabelText("Password"), "devpass1");
    await user.type(within(dialog).getByLabelText("App or backup code"), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Wrong password or code.");
    await user.clear(within(dialog).getByLabelText("App or backup code"));
    await user.type(within(dialog).getByLabelText("App or backup code"), "123456");
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByTestId("totp-state")).toHaveTextContent("Off");
    expect(mail.session.user.totpEnabled).toBe(false);
    expect(local.state.calls.totpDisable.at(-1)).toEqual({ password: "devpass1", code: "123456" });
  });

  it("regenerates the backup codes", async () => {
    const { local, user } = setup({ totp: true });
    await user.click(await screen.findByRole("button", { name: "Generate new backup codes" }));
    const dialog = await screen.findByRole("dialog", { name: "New backup codes" });
    await user.type(within(dialog).getByLabelText("Password"), "devpass1");
    await user.type(within(dialog).getByLabelText("App or backup code"), "abcde12345");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    const codes = await screen.findByRole("dialog", { name: "Backup codes" });
    expect(within(codes).getByText("n1n1n1n1n1")).toBeInTheDocument();
    expect(local.state.calls.backupCodes).toEqual([{ password: "devpass1", code: "abcde12345" }]);
  });
});

describe("sessions", () => {
  it("lists the sessions and signs out one and all others", async () => {
    const { local, user } = setup();
    const table = await screen.findByRole("table", { name: "Signed-in devices" });
    expect(within(table).getByText("Chrome · Windows")).toBeInTheDocument();
    expect(within(table).getByText("This device")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "Sign out: Pixel 8" }));
    await waitFor(() => expect(local.state.calls.revoke).toEqual(["s_3"]));
    await waitFor(() => expect(within(table).queryByText("Pixel 8")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Sign out everywhere else" }));
    await waitFor(() => expect(local.state.calls.revokeOthers).toBe(1));
    // One DELETE /sessions?others=true, no per-session DELETE.
    expect(local.state.calls.revoke).toEqual(["s_3"]);
    expect(await screen.findByText("No other sessions.")).toBeInTheDocument();
  });
});
