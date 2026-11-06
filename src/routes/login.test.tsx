import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { getCsrfToken, setCsrfToken } from "../api/csrf";
import { createLocalMock } from "../test/mockLocal";
import { createMockMail } from "../test/mockMail";
import { renderApp } from "../test/renderApp";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  setCsrfToken(null);
});
afterAll(() => server.close());

function loggedOut() {
  const mail = createMockMail();
  mail.state.loggedIn = false;
  server.use(...mail.handlers);
  return mail;
}

it("redirects to the login page without a session and shows the server version", async () => {
  loggedOut();
  const { router } = renderApp("/u/0/inbox");
  expect(await screen.findByRole("heading", { name: "Zaloguj się" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/login");
  expect(await screen.findByText("Silo · serwer 0.3.0")).toBeInTheDocument();
});

it("shows that the server is unreachable", async () => {
  loggedOut();
  server.use(http.get("*/api/v1/meta", () => HttpResponse.error()));
  renderApp("/login");
  expect(await screen.findByText("Nie można połączyć się z serwerem Silo.")).toBeInTheDocument();
});

it("signs in and opens the inbox", async () => {
  const mail = loggedOut();
  const user = userEvent.setup();
  const { router } = renderApp("/login");
  await user.type(await screen.findByLabelText("Adres e-mail"), "dev1@silo.test");
  await user.type(screen.getByLabelText("Hasło"), "devpass1");
  await user.click(screen.getByRole("button", { name: "Zaloguj" }));

  expect(await screen.findByRole("row", { name: /Temat 1/ })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/u/0/inbox");
  expect(mail.state.calls.login).toEqual([{ email: "dev1@silo.test", password: "devpass1" }]);
  expect(getCsrfToken()).toBe("csrf-1");
});

it("shows one message for invalid_credentials", async () => {
  loggedOut();
  const user = userEvent.setup();
  const { router } = renderApp("/login");
  await user.type(await screen.findByLabelText("Adres e-mail"), "dev1@silo.test");
  await user.type(screen.getByLabelText("Hasło"), "wrong");
  await user.click(screen.getByRole("button", { name: "Zaloguj" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nieprawidłowy adres e-mail lub hasło.",
  );
  await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
});

it("explains the rate limit with Retry-After", async () => {
  loggedOut();
  server.use(
    http.post("*/api/v1/session", () =>
      HttpResponse.json(
        { status: 429, code: "rate_limited" },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    ),
  );
  const user = userEvent.setup();
  renderApp("/login");
  await user.type(await screen.findByLabelText("Adres e-mail"), "dev1@silo.test");
  await user.type(screen.getByLabelText("Hasło"), "devpass1");
  await user.click(screen.getByRole("button", { name: "Zaloguj" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Spróbuj ponownie za 30 s.");
});

function localMode(totp: boolean) {
  const mail = loggedOut();
  const local = createLocalMock(mail);
  mail.session.user.totpEnabled = totp;
  server.use(...local.handlers);
  return { mail, local };
}

async function typePassword(user: ReturnType<typeof userEvent.setup>, password = "devpass1") {
  await user.type(await screen.findByLabelText("Adres e-mail"), "dev1@silo.test");
  await user.type(screen.getByLabelText("Hasło"), password);
  await user.click(screen.getByRole("button", { name: "Zaloguj" }));
}

it("mode local: Silo heading without the mail server hint", async () => {
  localMode(false);
  renderApp("/login");
  expect(await screen.findByRole("heading", { name: "Zaloguj się do Silo" })).toBeInTheDocument();
  expect(screen.queryByText(/skrzynki pocztowej/)).not.toBeInTheDocument();
});

it("mode local: asks for the TOTP code after the password and signs in with it", async () => {
  const { local } = localMode(true);
  const user = userEvent.setup();
  const { router } = renderApp("/login");
  await typePassword(user);

  const code = await screen.findByLabelText("Kod z aplikacji");
  expect(code).toHaveFocus();
  expect(code).toHaveAttribute("inputmode", "numeric");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Hasło")).not.toBeInTheDocument();

  // A wrong code: one message, the code step stays.
  await user.type(code, "000000");
  await user.click(screen.getByRole("button", { name: "Potwierdź" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nieprawidłowy e-mail, hasło lub kod.",
  );
  await user.type(screen.getByLabelText("Kod z aplikacji"), "123456");
  await user.click(screen.getByRole("button", { name: "Potwierdź" }));

  expect(await screen.findByRole("row", { name: /Temat 1/ })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/u/0/inbox");
  expect(local.state.calls.login).toEqual([
    { email: "dev1@silo.test", password: "devpass1" },
    { email: "dev1@silo.test", password: "devpass1", totpCode: "000000" },
    { email: "dev1@silo.test", password: "devpass1", totpCode: "123456" },
  ]);
  expect(JSON.stringify({ ...localStorage })).not.toContain("devpass1");
  expect(JSON.stringify({ ...sessionStorage })).not.toContain("devpass1");
});

it("mode local: signs in with a backup code", async () => {
  const { local } = localMode(true);
  const user = userEvent.setup();
  renderApp("/login");
  await typePassword(user);
  await user.click(await screen.findByRole("button", { name: "Użyj kodu zapasowego" }));
  const code = screen.getByLabelText("Kod zapasowy");
  expect(code).toHaveFocus();
  await user.type(code, "abcde12345");
  await user.click(screen.getByRole("button", { name: "Potwierdź" }));
  expect(await screen.findByRole("row", { name: /Temat 1/ })).toBeInTheDocument();
  expect(local.state.backupCodes).toEqual(["fghij67890"]);
});

it("mode local: a wrong password gives the same message as a wrong code", async () => {
  localMode(true);
  const user = userEvent.setup();
  renderApp("/login");
  await typePassword(user, "wrong");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nieprawidłowy e-mail, hasło lub kod.",
  );
  expect(screen.queryByLabelText("Kod z aplikacji")).not.toBeInTheDocument();
});

it("mode local: 429 on the code step shows Retry-After", async () => {
  localMode(true);
  const user = userEvent.setup();
  renderApp("/login");
  await typePassword(user);
  await screen.findByLabelText("Kod z aplikacji");
  server.use(
    http.post("*/api/v1/session", () =>
      HttpResponse.json(
        { status: 429, code: "rate_limited" },
        { status: 429, headers: { "Retry-After": "12" } },
      ),
    ),
  );
  await user.type(screen.getByLabelText("Kod z aplikacji"), "123456");
  await user.click(screen.getByRole("button", { name: "Potwierdź" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Spróbuj ponownie za 12 s.");
});
