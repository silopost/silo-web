import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { oauthConfig } from "../account/oauth";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

/** Ustawienia → Konta: "Add account" (discover → test → add), OAuth, password, removal. */

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
const assign = oauthConfig.assign;
const assigned: string[] = [];
afterEach(() => {
  server.resetHandlers();
  oauthConfig.assign = assign;
  assigned.length = 0;
});
afterAll(() => server.close());

type Mail = ReturnType<typeof createMockMail>;

function setup(url = "/u/0/settings/accounts", prepare?: (mail: Mail) => void) {
  const mail = createMockMail();
  prepare?.(mail);
  server.use(...mail.handlers);
  oauthConfig.assign = (u) => void assigned.push(u);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add account" }));
  return screen.findByRole("dialog", { name: "Add account" });
}

async function emailStep(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  email = "dev2@silo.test",
) {
  await user.type(within(dialog).getByLabelText("Email address"), email);
  await user.type(within(dialog).getByLabelText("Password"), "devpass2");
  await user.click(within(dialog).getByRole("button", { name: "Next" }));
}

describe("Add account", () => {
  it("discovers, tests and adds an account, then opens its inbox", async () => {
    const { mail, user, router } = setup();
    const dialog = await openDialog(user);
    await emailStep(user, dialog);
    expect(await within(dialog).findByText("Settings found: default server")).toBeInTheDocument();
    expect(mail.state.calls.discover).toEqual(["dev2@silo.test"]);

    // Found: the advanced section is collapsed; the instance allows only its own server.
    const advanced = within(dialog).getByRole("button", { name: /Advanced/ });
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    await user.click(advanced);
    const host = within(dialog).getByRole("textbox", { name: "IMAP (incoming): Server" });
    expect(host).toHaveValue("mail.silo.test");
    expect(host).toHaveAttribute("readonly");

    await user.click(within(dialog).getByRole("button", { name: "Test connection" }));
    expect(await within(dialog).findByText("The connection works.")).toBeInTheDocument();
    const imap = within(dialog).getByRole("region", { name: "IMAP" });
    expect(
      within(imap)
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual(["Connection, passed", "TLS, passed", "Sign-in, passed"]);
    expect(mail.state.calls.accountTest).toEqual([
      { email: "dev2@silo.test", password: "devpass2", username: "dev2@silo.test" },
    ]);

    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/1/inbox"));
    expect(mail.state.calls.accountCreate).toEqual([
      { email: "dev2@silo.test", password: "devpass2", username: "dev2@silo.test" },
    ]);
    expect(screen.queryByRole("dialog", { name: "Add account" })).toBeNull();
    expect(await screen.findByText("Account dev2@silo.test added.")).toBeInTheDocument();
  });

  it("opens the advanced settings when nothing was found and sends custom hosts", async () => {
    const { mail, user } = setup("/u/0/settings/accounts", (m) => {
      m.state.allowCustomServers = true;
      m.state.discovery = {
        email: "jan@example.com",
        domain: "example.com",
        imap: null,
        smtp: null,
        username: "jan@example.com",
        loginFormat: "email",
        source: null,
        sources: [],
        provider: "generic",
        params: { email: "jan@example.com", username: "jan@example.com" },
      };
    });
    const dialog = await openDialog(user);
    await emailStep(user, dialog, "jan@example.com");
    expect(await within(dialog).findByText(/No server settings found/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Advanced/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "IMAP (incoming): Server" }),
      "imap.example.com",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "SMTP (outgoing): Server" }),
      "smtp.example.com",
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "SMTP (outgoing): Encryption" }),
      "none",
    );
    expect(within(dialog).getByText(/as plain text/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(mail.state.calls.accountCreate).toHaveLength(1));
    expect(mail.state.calls.accountCreate[0]).toEqual({
      email: "jan@example.com",
      password: "devpass2",
      username: "jan@example.com",
      imapHost: "imap.example.com",
      imapPort: 993,
      imapTls: "implicit",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpTls: "none",
    });
  });

  it("shows the failed steps of 422 account_test_failed and keeps the dialog", async () => {
    const { user } = setup("/u/0/settings/accounts", (m) => {
      m.state.testFails = true;
    });
    const dialog = await openDialog(user);
    await emailStep(user, dialog);
    await user.click(await within(dialog).findByRole("button", { name: "Add" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The connection test failed",
    );
    expect(
      within(dialog).getByRole("listitem", {
        name: "Sign-in, failed, AUTHENTICATIONFAILED",
      }),
    ).toBeInTheDocument();
  });

  it("explains 409 account_limit_reached", async () => {
    const { user } = setup("/u/0/settings/accounts", (m) => {
      m.state.createProblem = { status: 409, code: "account_limit_reached" };
    });
    const dialog = await openDialog(user);
    await emailStep(user, dialog);
    await user.click(await within(dialog).findByRole("button", { name: "Add" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This user has reached the account limit.",
    );
  });

  it("opens from the AccountSwitcher with ?add", async () => {
    setup("/u/0/settings/accounts?add=true");
    expect(await screen.findByRole("dialog", { name: "Add account" })).toBeInTheDocument();
  });
});

describe("OAuth", () => {
  it("starts Google sign-in and leaves for the provider's URL", async () => {
    const { mail, user } = setup("/u/0/settings/accounts", (m) => {
      m.state.oauthProviders = ["google"];
    });
    const dialog = await openDialog(user);
    expect(within(dialog).queryByRole("button", { name: "Sign in with Microsoft" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Sign in with Google" }));
    await waitFor(() => expect(assigned).toEqual(["https://google.example/auth?state=st_1"]));
    expect(mail.state.calls.oauthStart).toEqual([
      { provider: "google", returnTo: "/u/0/settings/accounts" },
    ]);
  });

  it("suggests Google sign-in for a discovered Gmail address", async () => {
    const { user } = setup("/u/0/settings/accounts", (m) => {
      m.state.oauthProviders = ["google", "microsoft"];
      m.state.discovery = {
        email: "jan@gmail.com",
        domain: "gmail.com",
        imap: { host: "imap.gmail.com", port: 993, tls: "implicit" },
        smtp: { host: "smtp.gmail.com", port: 465, tls: "implicit" },
        username: "jan@gmail.com",
        loginFormat: "email",
        source: "ispdb",
        sources: [],
        provider: "gmail",
        params: { email: "jan@gmail.com", username: "jan@gmail.com" },
      };
    });
    const dialog = await openDialog(user);
    await emailStep(user, dialog, "jan@gmail.com");
    expect(
      await within(dialog).findByText("This is a Google account – sign in with Google."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Settings found: ISPDB")).toBeInTheDocument();
  });

  it("explains ?oauth=error and removes the parameters from the URL", async () => {
    const { router } = setup("/u/0/settings/accounts?oauth=error&code=oauth_denied");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in was cancelled or access was denied.",
    );
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    // The message stays after the URL was cleaned.
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("confirms ?oauth=ok, refreshes the session and cleans the URL", async () => {
    const { router } = setup("/u/0/settings/accounts?oauth=ok&accountId=acc_2", (m) => {
      m.addAccount(2, { authType: "xoauth2", provider: "gmail" });
    });
    expect(
      await screen.findByText("Account connected by signing in with the provider."),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByRole("listitem", { name: "dev2@silo.test" })).toBeInTheDocument();
  });

  it("re-authorizes an OAuth account after auth_failed, from the list and the banner", async () => {
    const { mail, user } = setup("/u/1/settings/accounts", (m) => {
      m.state.oauthProviders = ["google"];
      m.addAccount(2, { authType: "xoauth2", provider: "gmail", state: "auth_failed" });
    });
    const row = await screen.findByRole("listitem", { name: "dev2@silo.test" });
    expect(within(row).getByText("OAuth")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Change password" })).toBeNull();
    await user.click(within(row).getByRole("button", { name: "Sign in again" }));
    await waitFor(() => expect(assigned).toHaveLength(1));
    expect(mail.state.calls.oauthStart).toEqual([
      { provider: "google", returnTo: "/u/1/settings/accounts", accountId: "acc_2" },
    ]);

    const banner = await screen.findByText(/The authorization of dev2@silo.test expired/);
    await user.click(within(banner.parentElement!).getByRole("button", { name: "Sign in again" }));
    await waitFor(() => expect(mail.state.calls.oauthStart).toHaveLength(2));
  });
});

describe("account list", () => {
  it("changes the password of a password account", async () => {
    const { mail, user } = setup();
    const row = await screen.findByRole("listitem", { name: "dev1@silo.test" });
    await user.click(within(row).getByRole("button", { name: "Change password" }));
    await user.type(within(row).getByLabelText("New password for dev1@silo.test"), "nowe-haslo");
    await user.click(within(row).getByRole("button", { name: "Save password" }));
    await waitFor(() =>
      expect(mail.state.calls.accountPatch).toEqual([{ id: "acc_1", password: "nowe-haslo" }]),
    );
    expect(await screen.findByText("Password saved.")).toBeInTheDocument();
  });

  it("removes an account after confirming and leaves its pages", async () => {
    const { mail, user, router } = setup("/u/1/settings/accounts", (m) => {
      m.addAccount(2);
    });
    const row = await screen.findByRole("listitem", { name: "dev2@silo.test" });
    await user.click(within(row).getByRole("button", { name: "Remove account" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Remove the account dev2@silo.test from Silo?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Remove account" }));
    await waitFor(() => expect(mail.state.calls.accountDelete).toEqual(["acc_2"]));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/settings/accounts"));
    expect(screen.queryByRole("listitem", { name: "dev2@silo.test" })).toBeNull();
  });

  it("links the password banner of an account to its settings", async () => {
    setup("/u/0/inbox", (m) => {
      m.session.accounts![0]!.state = "auth_failed";
    });
    const link = await screen.findByRole("link", { name: "Update password" });
    expect(link).toHaveAttribute("href", "/u/0/settings/accounts");
  });
});

describe("backup and dead operations", () => {
  it("explains backups without calling the server", async () => {
    setup();
    const section = await screen.findByRole("region", { name: "Backup" });
    expect(section).toHaveTextContent("scripts/backup.sh metadata");
    expect(within(section).getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/silopost/silo/blob/main/docs/admin/backup.md",
    );
  });

  it("shows dead operations, with a link to the jobs for an admin", async () => {
    const { router, user } = setup("/u/0/settings/accounts", (m) => {
      m.state.deadOps = 2;
      m.session.user.isAdmin = true;
    });
    const row = await screen.findByRole("listitem", { name: "dev1@silo.test" });
    expect(await within(row).findByText(/Failed operations: 2/)).toBeInTheDocument();
    await user.click(within(row).getByRole("link", { name: "See in Administration" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/admin/jobs"));
    expect(router.state.location.search).toEqual({ status: "dead", accountId: "acc_1" });
  });

  it("hides the admin link from other users", async () => {
    setup("/u/0/settings/accounts", (m) => {
      m.state.deadOps = 1;
    });
    const row = await screen.findByRole("listitem", { name: "dev1@silo.test" });
    expect(await within(row).findByText(/Failed operations: 1/)).toBeInTheDocument();
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
  });
});
