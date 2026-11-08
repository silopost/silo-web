import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(url = "/u/0/inbox/t_1") {
  const mail = createMockMail();
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

it("renders the message in a sandboxed iframe without allow-scripts", async () => {
  const { mail } = setup();
  mail.state.html = '<p>Treść</p><script>alert(1)</script><img src=x onerror="alert(2)">';

  expect(await screen.findByRole("heading", { name: "Temat 1" })).toBeInTheDocument();
  const frame = await screen.findByTitle("Message body: Temat 1");
  const sandbox = frame.getAttribute("sandbox") ?? "";
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).toContain("allow-same-origin");
  const doc = frame.getAttribute("srcdoc") ?? "";
  expect(doc).toContain("<p>Treść</p>");
  expect(doc).not.toContain("<script");
  expect(doc).not.toContain("onerror");
  expect(doc).toContain("script-src 'none'");
  // The unread message is expanded with its attachment link.
  expect(screen.getByRole("link", { name: /Download oferta\.pdf/ })).toHaveAttribute(
    "href",
    "/api/v1/attachments/a_1",
  );
});

it("marks an unread thread read when it opens", async () => {
  const { mail } = setup();
  await screen.findByRole("heading", { name: "Temat 1" });
  await waitFor(() =>
    expect(mail.state.calls.modify).toEqual([
      { ids: ["t_1"], addLabelIds: [], removeLabelIds: ["UNREAD"] },
    ]),
  );
  // Silent: no snackbar for marking read on open.
  expect(screen.queryByText(/oznaczony jako przeczytany/)).toBeNull();
});

it("retries a body that is not downloaded yet (503 + Retry-After)", async () => {
  const { mail } = setup("/u/0/inbox/t_3");
  let calls = 0;
  server.use(
    http.get("*/api/v1/messages/:id/html", () => {
      calls += 1;
      if (calls === 1) {
        return HttpResponse.json(
          { status: 503, code: "content_not_available" },
          { status: 503, headers: { "Retry-After": "0" } },
        );
      }
      return new HttpResponse(mail.state.html, { headers: { "Content-Type": "text/html" } });
    }),
  );
  expect(await screen.findByText("Fetching the message from the mail server…")).toBeInTheDocument();
  expect(await screen.findByTitle("Message body: Temat 3")).toBeInTheDocument();
});

it("archives from the thread and goes back to the list", async () => {
  const { mail, user, router } = setup("/u/0/inbox/t_2");
  await screen.findByRole("heading", { name: "Temat 2" });
  const toolbar = screen.getAllByRole("toolbar")[0]!;
  await user.click(within(toolbar).getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/inbox"));
  expect(mail.state.calls.modify.at(-1)).toMatchObject({ ids: ["t_2"], removeLabelIds: ["INBOX"] });
  expect(await screen.findByText("Conversation archived")).toBeInTheDocument();
});

it("goes back to the list with u", async () => {
  const { user, router } = setup("/u/0/inbox/t_2");
  await screen.findByRole("heading", { name: "Temat 2" });
  await user.keyboard("u");
  await waitFor(() => expect(router.state.location.pathname).toBe("/u/0/inbox"));
});
