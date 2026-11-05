import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { FakeEventSource } from "../../test/fakeEventSource";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
  const mail = createMockMail();
  server.use(...mail.handlers);
  const user = userEvent.setup();
  const app = renderApp("/u/0/inbox");
  return { mail, user, ...app };
}

const row = (subject: string) => screen.findByRole("row", { name: new RegExp(subject) });
const rowNames = () => screen.getAllByRole("row").map((r) => r.getAttribute("data-thread-id"));

it("renders the inbox and loads the next page by cursor", async () => {
  const { mail } = setup();
  const first = await row("Temat 1");
  expect(first).toHaveAttribute("aria-label", expect.stringContaining("Nieprzeczytane"));
  // Page 1 has 3 rows; the viewport is taller, so page 2 (cursor "3") follows.
  expect(await row("Temat 5")).toBeInTheDocument();
  expect(mail.state.calls.threadPages).toEqual([null, "3"]);
  expect(rowNames()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]);
  expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "5");
  // LeftNav counter from GET /labels.
  expect(screen.getByRole("link", { name: /Odebrane/ })).toHaveTextContent("1");
});

it("archives optimistically and restores the row on Cofnij", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(within(await row("Temat 2")).getByRole("button", { name: "Archiwizuj" }));

  await waitFor(() => expect(screen.queryByRole("row", { name: /Temat 2/ })).toBeNull());
  expect(mail.state.calls.modify).toEqual([
    { ids: ["t_2"], addLabelIds: [], removeLabelIds: ["INBOX"] },
  ]);
  const snackbar = await screen.findByText("Wątek zarchiwizowany");
  await user.click(within(snackbar.parentElement!).getByRole("button", { name: "Cofnij" }));

  expect(await row("Temat 2")).toBeInTheDocument();
  expect(mail.state.calls.undo).toEqual(["op_1"]);
  await waitFor(() => expect(rowNames()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]));
});

it("rolls back when the request fails", async () => {
  const { mail, user } = setup();
  mail.state.failModify = true;
  await row("Temat 5");
  await user.click(within(await row("Temat 3")).getByRole("button", { name: "Archiwizuj" }));

  expect(await screen.findByText("Nie udało się. Spróbuj ponownie.")).toBeInTheDocument();
  expect(await row("Temat 3")).toBeInTheDocument();
  expect(rowNames()).toEqual(["t_1", "t_2", "t_3", "t_4", "t_5"]);
});

it("rolls back on operation.failed from the event stream", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(within(await row("Temat 4")).getByRole("button", { name: "Archiwizuj" }));
  await screen.findByText("Wątek zarchiwizowany");
  expect(screen.queryByRole("row", { name: /Temat 4/ })).toBeNull();

  // The write-back gave up: the server restored its state and reports it.
  mail.revert("op_1");
  act(() =>
    FakeEventSource.latest().emit("operation.failed", {
      operationId: "op_1",
      accountId: "acc_1",
      kind: "move",
      reason: "imap",
      threadIds: ["t_4"],
    }),
  );

  expect(await row("Temat 4")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Nie udało się przenieść 1 wątku na serwerze poczty – przywrócono stan z serwera",
    ),
  ).toBeInTheDocument();
});

it("selects rows with SelectMenu and acts on the selection", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(screen.getByRole("button", { name: "Opcje zaznaczania" }));
  await user.click(await screen.findByRole("menuitem", { name: "Z gwiazdką" }));

  expect(screen.getByRole("row", { name: /Temat 2/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("row", { name: /Temat 1/ })).toHaveAttribute("aria-selected", "false");

  await user.click(screen.getByRole("button", { name: "Opcje zaznaczania" }));
  await user.click(await screen.findByRole("menuitem", { name: "Wszystkie" }));
  expect(screen.getAllByRole("row").every((r) => r.getAttribute("aria-selected") === "true")).toBe(
    true,
  );

  const toolbar = screen.getByRole("toolbar");
  await user.click(within(toolbar).getByRole("button", { name: "Oznacz jako przeczytane" }));
  await waitFor(() => expect(mail.state.calls.modify).toHaveLength(1));
  expect(mail.state.calls.modify[0]).toMatchObject({
    ids: ["t_1", "t_2", "t_3", "t_4", "t_5"],
    removeLabelIds: ["UNREAD"],
  });
  expect(await screen.findByText("5 wątków oznaczonych jako przeczytane")).toBeInTheDocument();
});

it("moves with j/k, archives with e and undoes with z", async () => {
  const { mail, user } = setup();
  await row("Temat 5");

  // The first row is the cursor before any key (Gmail): j goes to the second one.
  expect(screen.getByRole("row", { name: /Temat 1/ })).toHaveAttribute("tabindex", "0");
  await user.keyboard("j");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("row", { name: /Temat 2/ })),
  );
  await user.keyboard("j");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("row", { name: /Temat 3/ })),
  );
  await user.keyboard("k");
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("row", { name: /Temat 2/ })),
  );

  await user.keyboard("e");
  await waitFor(() => expect(screen.queryByRole("row", { name: /Temat 2/ })).toBeNull());
  expect(mail.state.calls.modify[0]).toMatchObject({ ids: ["t_2"], removeLabelIds: ["INBOX"] });
  await screen.findByText("Wątek zarchiwizowany");

  await user.keyboard("z");
  expect(await row("Temat 2")).toBeInTheDocument();
  expect(mail.state.calls.undo).toEqual(["op_1"]);
});

it("ignores shortcuts while typing in the search box", async () => {
  const { mail, user } = setup();
  await row("Temat 5");
  await user.click(screen.getByRole("searchbox"));
  await user.keyboard("je");
  expect(mail.state.calls.modify).toEqual([]);
  expect(screen.getByRole("searchbox")).toHaveValue("je");
});
