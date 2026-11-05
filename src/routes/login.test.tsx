import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { getCsrfToken, setCsrfToken } from "../api/csrf";
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
