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

const card = (id: string) => document.querySelector<HTMLElement>(`[data-message-id="${id}"]`)!;

it("opens a reply inline under the message it answers and closes it", async () => {
  const { mail, user } = setup("/u/0/inbox/t_2");
  await screen.findByRole("heading", { name: "Temat 2" });
  // The first message is collapsed (read): expand it, then reply from its card.
  await user.click(screen.getByRole("button", { name: "Nadawca 1" }));
  await user.click(within(card("m_t_2_1")).getByRole("button", { name: "Reply" }));
  const first = await screen.findByRole("region", { name: "Re: Temat 2" });
  expect(mail.state.calls.createDraft).toEqual([{ replyToMessageId: "m_t_2_1", mode: "reply" }]);
  // Right under its message, above the next one; not a dock window.
  expect(card("m_t_2_1").nextElementSibling).toContainElement(first);
  expect(first.compareDocumentPosition(card("m_t_2_2")) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.queryByRole("dialog", { name: "Re: Temat 2" })).toBeNull();
  await waitFor(() =>
    expect(within(first).getByRole("textbox", { name: "Message body" })).toHaveFocus(),
  );
  // The reply bar is hidden while the reply is open.
  expect(screen.queryByRole("button", { name: "Reply all" })).toBeNull();

  // Reply on another message: the first reply is saved and closed, the new one opens there.
  await user.click(within(card("m_t_2_2")).getByRole("button", { name: "Reply" }));
  await waitFor(() => expect(mail.state.calls.createDraft).toHaveLength(2));
  const second = await screen.findByRole("region", { name: "Re: Temat 2" });
  expect(card("m_t_2_2").nextElementSibling).toContainElement(second);
  expect(screen.getAllByRole("region", { name: "Re: Temat 2" })).toHaveLength(1);

  // Save & close removes it; the reply bar is back.
  await user.click(within(second).getByRole("button", { name: "Save & close" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Re: Temat 2" })).toBeNull());
  expect(screen.getByRole("button", { name: "Reply all" })).toBeInTheDocument();
});

it("opens the reply of the reply bar and of r under the last message; Esc closes it", async () => {
  const { mail, user } = setup("/u/0/inbox/t_2");
  await screen.findByRole("heading", { name: "Temat 2" });
  await user.click(screen.getByRole("button", { name: "Reply all" }));
  const win = await screen.findByRole("region", { name: "Re: Temat 2" });
  expect(mail.state.calls.createDraft).toEqual([{ replyToMessageId: "m_t_2_2", mode: "replyAll" }]);
  expect(card("m_t_2_2").nextElementSibling).toContainElement(win);
  const body = within(win).getByRole("textbox", { name: "Message body" });
  await waitFor(() => expect(body).toHaveFocus());
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("region", { name: "Re: Temat 2" })).toBeNull());

  await user.keyboard("r");
  const again = await screen.findByRole("region", { name: "Re: Temat 2" });
  expect(card("m_t_2_2").nextElementSibling).toContainElement(again);
  expect(mail.state.calls.createDraft.at(-1)).toEqual({
    replyToMessageId: "m_t_2_2",
    mode: "reply",
  });
});

it("moves an inline reply to a dock window with Open in a window", async () => {
  const { user } = setup("/u/0/inbox/t_2");
  await screen.findByRole("heading", { name: "Temat 2" });
  await user.keyboard("r");
  const win = await screen.findByRole("region", { name: "Re: Temat 2" });
  await user.click(within(win).getByRole("button", { name: "Open in a window" }));
  expect(await screen.findByRole("dialog", { name: "Re: Temat 2" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Re: Temat 2" })).toBeNull();
});

it("trusts the sender when external images are shown and shows them by default after that", async () => {
  const { mail, user } = setup();
  mail.state.html = '<p>Treść</p><img src="https://cdn.example/a.png">';
  const frame = await screen.findByTitle("Message body: Temat 1");
  expect(frame.getAttribute("srcdoc")).toContain("img-src 'self' data:;");
  await user.click(screen.getByRole("button", { name: "Display images" }));
  expect(frame.getAttribute("srcdoc")).toContain("img-src 'self' data: https: http:");
  expect(screen.queryByText("External images are hidden.")).toBeNull();
  await waitFor(() =>
    expect(mail.state.calls.settings).toEqual([{ trustedImageSenders: ["osoba@firma.pl"] }]),
  );
  expect(mail.session.settings.trustedImageSenders).toEqual(["osoba@firma.pl"]);
});

it("shows external images at once for a trusted sender (any case)", async () => {
  const mail = createMockMail();
  mail.session.settings.trustedImageSenders = ["osoba@firma.pl"];
  mail.state.html = '<p>Treść</p><img src="https://cdn.example/a.png">';
  server.use(...mail.handlers);
  renderApp("/u/0/inbox/t_1");
  const frame = await screen.findByTitle("Message body: Temat 1");
  expect(frame.getAttribute("srcdoc")).toContain("img-src 'self' data: https: http:");
  expect(screen.queryByRole("button", { name: "Display images" })).toBeNull();
  expect(mail.state.calls.settings).toEqual([]);
});
