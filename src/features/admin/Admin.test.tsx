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
  it("non-admin: no menu entry and the page says Access denied", async () => {
    const { user } = setup("/u/0/inbox", { admin: false });
    await user.click(await screen.findByRole("button", { name: /dev1@silo.test/ }));
    expect(await screen.findByRole("menuitem", { name: "Manage accounts" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Administration" })).not.toBeInTheDocument();
  });

  it("non-admin: the URL shows Access denied without asking the server", async () => {
    const { admin } = setup("/u/0/admin/jobs", { admin: false });
    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(admin.state.calls.jobsQuery).toEqual([]);
  });

  it("a 403 forbidden of the server shows Access denied", async () => {
    setup("/u/0/admin/users", { forbidden: true });
    expect(await screen.findByText("Access denied")).toBeInTheDocument();
  });

  it("admin: Administracja in the account menu opens the users", async () => {
    const { user, router } = setup("/u/0/inbox");
    await user.click(await screen.findByRole("button", { name: /dev1@silo.test/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Administration" }));
    expect(await screen.findByRole("table", { name: "Users" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/u/0/admin/users");
  });
});

describe("users", () => {
  it("lists users with their accounts and states", async () => {
    setup("/u/0/admin/users");
    const table = await screen.findByRole("table", { name: "Users" });
    const ala = within(table).getByRole("row", { name: /ala@silo.test/ });
    expect(within(ala).getByText("ala@example.com")).toBeInTheDocument();
    expect(within(ala).getByText("Sign-in error")).toHaveAttribute("data-state", "auth_failed");
    // Mode imap: users appear at their first sign-in, nobody is added here.
    expect(screen.queryByRole("button", { name: "Add user" })).not.toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Email",
      "Name",
      "Administrator",
      "Blocked",
      "TOTP",
      "Accounts",
      "Created",
      "Actions",
    ]);
  });

  it("mode local: adds a user and shows the temporary password once", async () => {
    const { admin, user } = setup("/u/0/admin/users", { local: true });
    await user.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    expect(within(dialog).getByLabelText("Email")).toHaveFocus();
    await user.type(within(dialog).getByLabelText("Email"), "nowy@silo.test");
    await user.type(within(dialog).getByLabelText("Display name (optional)"), "Nowy");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));

    const temp = await screen.findByRole("dialog", { name: "Temporary password" });
    expect(within(temp).getByLabelText("Temporary password")).toHaveTextContent("Tymczasowe-1234");
    expect(admin.state.calls.create).toEqual([
      { email: "nowy@silo.test", displayName: "Nowy", isAdmin: false },
    ]);
    await user.click(within(temp).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("Tymczasowe-1234")).not.toBeInTheDocument();
    expect(
      await within(screen.getByRole("table")).findByRole("row", { name: /nowy@silo.test/ }),
    ).toBeInTheDocument();
  });

  it("mode local: user_exists is shown in the dialog", async () => {
    const { user } = setup("/u/0/admin/users", { local: true });
    await user.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", { name: "Add user" });
    await user.type(within(dialog).getByLabelText("Email"), "ala@silo.test");
    await user.type(within(dialog).getByLabelText("Password (optional)"), "dlugie-haslo-1");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already exists");
  });

  it("blocks a user, refuses a self change with its message", async () => {
    const { admin, user } = setup("/u/0/admin/users");
    await user.click(await screen.findByRole("button", { name: "Actions: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Block" }));
    await waitFor(() => expect(admin.state.calls.patch).toEqual([{ id: "u_2", disabled: true }]));
    const ala = await screen.findByRole("row", { name: /ala@silo.test/ });
    await waitFor(() => expect(within(ala).getAllByText("yes")).toHaveLength(2));

    // The admin's own row has the self-changing actions disabled.
    await user.click(screen.getByRole("button", { name: "Actions: dev1@silo.test" }));
    expect(await screen.findByRole("menuitem", { name: "Block" })).toHaveAttribute("data-disabled");
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
    await user.click(await screen.findByRole("button", { name: "Actions: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Make administrator" }));
    await waitFor(() => expect(admin.state.calls.patch).toHaveLength(1));
    expect(
      await screen.findByText("You can't block, delete or remove the rights of your own account."),
    ).toBeInTheDocument();
  });

  it("resets TOTP and the password, deletes after typing the address", async () => {
    const { admin, user } = setup("/u/0/admin/users", { local: true });
    await user.click(await screen.findByRole("button", { name: "Actions: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset TOTP" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset TOTP" }),
    );
    await waitFor(() => expect(admin.state.calls.totpReset).toEqual(["u_2"]));

    await user.click(screen.getByRole("button", { name: "Actions: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset password" }));
    const pw = await screen.findByRole("dialog", { name: "New password for ala@silo.test" });
    await user.click(within(pw).getByRole("button", { name: "Generate" }));
    const generated = (within(pw).getByLabelText("New password") as HTMLInputElement).value;
    expect(generated).toHaveLength(16);
    await user.click(within(pw).getByRole("button", { name: "Set password" }));
    await waitFor(() =>
      expect(admin.state.calls.patch).toEqual([{ id: "u_2", password: generated }]),
    );

    await user.click(screen.getByRole("button", { name: "Actions: ala@silo.test" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const del = await screen.findByRole("dialog", { name: "Delete the user ala@silo.test?" });
    const confirm = within(del).getByRole("button", { name: "Delete" });
    expect(confirm).toBeDisabled();
    await user.type(within(del).getByLabelText("Type ala@silo.test to confirm"), "ala@silo.test");
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
    const table = await screen.findByRole("table", { name: "Accounts" });
    const row = within(table).getByRole("row", { name: /ala@example.com/ });
    expect(within(table).getByRole("columnheader", { name: "Sign-in" })).toBeInTheDocument();
    expect(within(row).getByText("imap.example.com")).toBeInTheDocument();
    expect(within(row).getByText("OAuth2")).toBeInTheDocument();
    expect(
      within(within(table).getByRole("row", { name: /dev1@silo.test/ })).getByText("Password"),
    ).toBeInTheDocument();
    expect(within(row).getByText("AUTHENTICATIONFAILED")).toBeInTheDocument();
    expect(within(row).getByText("never")).toBeInTheDocument();
    await user.click(
      within(row).getByRole("link", { name: "Failed operations of ala@example.com: 2" }),
    );
    expect(await screen.findByRole("table", { name: "Jobs: Failed" })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ status: "dead", accountId: "acc_2" });
  });
});

describe("jobs", () => {
  it("shows dead jobs by default, filters pending, retries and discards with confirmation", async () => {
    const { admin, user } = setup("/u/0/admin/jobs");
    const table = await screen.findByRole("table", { name: "Jobs: Failed" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(admin.state.calls.jobsQuery[0]).toBe("?status=dead");
    const first = within(table).getByRole("row", { name: /job_1/ });
    const error = within(first).getByTitle(/^NO \[TRYCREATE\]/);
    expect(error.textContent!.endsWith("…")).toBe(true);
    expect(within(first).getByText("ala@example.com (ala@silo.test)")).toBeInTheDocument();
    expect(within(first).getByText("8/8")).toBeInTheDocument();

    await user.click(within(first).getByRole("button", { name: "Retry job_1" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Retry the job job_1?" });
    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(admin.state.calls.retry).toEqual(["job_1"]));
    await waitFor(() =>
      expect(screen.queryByRole("row", { name: /job_1/ })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Delete job_2" }));
    const discard = await screen.findByRole("alertdialog", { name: "Delete the job job_2?" });
    await user.click(within(discard).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(admin.state.calls.deleteJob).toEqual(["job_2"]));
    expect(await screen.findByText("No jobs.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status"), "pending");
    const pending = await screen.findByRole("table", { name: "Jobs: Pending" });
    expect(within(pending).getByText("whole instance")).toBeInTheDocument();
    expect(admin.state.calls.jobsQuery).toContain("?status=pending");

    await user.selectOptions(screen.getByLabelText("Account"), "acc_2");
    await waitFor(() =>
      expect(admin.state.calls.jobsQuery).toContain("?status=pending&accountId=acc_2"),
    );
  });
});
