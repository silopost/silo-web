import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { FakeEventSource } from "../../test/fakeEventSource";
import { createMockMail } from "../../test/mockMail";
import { renderApp } from "../../test/renderApp";
import { composeConfig } from "./session";

/** The "Od" field of plan 6.3 with two accounts (plan 5.2: PUT /drafts/{id} accountId). */

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  composeConfig.autosaveMs = 2000;
});
afterAll(() => server.close());

function setup(url = "/u/0/inbox") {
  const mail = createMockMail();
  mail.addAccount(2);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

async function openCompose(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("grid");
  await user.keyboard("c");
  return screen.findByRole("dialog", { name: "Nowa wiadomość" });
}

const from = (win: HTMLElement) =>
  within(win).getByRole<HTMLSelectElement>("combobox", { name: "Od" });

it("creates the draft in the account of the URL and lists the accounts in Od", async () => {
  const { mail, user } = setup("/u/1/inbox");
  const win = await openCompose(user);
  expect(mail.state.calls.createDraft).toEqual([{ accountId: "acc_2" }]);
  expect(from(win).value).toBe("acc_2");
  expect(
    within(from(win))
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["Dev One <dev1@silo.test>", "Dev 2 <dev2@silo.test>"]);
});

it("moves the draft to the chosen account and follows its new id in the same window", async () => {
  const { mail, user } = setup();
  const win = await openCompose(user);
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Z drugiego");
  await user.selectOptions(from(win), "acc_2");

  await waitFor(() =>
    expect(mail.state.calls.putDraft).toContainEqual(
      expect.objectContaining({ id: "d_1", version: 1, accountId: "acc_2", subject: "Z drugiego" }),
    ),
  );
  expect(from(win).value).toBe("acc_2");
  // The answer carried new ids: the old draft is gone, the same window (no remount) edits d_2.
  expect([...mail.state.drafts.keys()]).toEqual(["d_2"]);
  expect(screen.getByRole("dialog", { name: "Z drugiego" })).toBe(win);
  expect(within(win).getByRole("textbox", { name: "Temat" })).toHaveValue("Z drugiego");

  await user.type(within(win).getByRole("combobox", { name: "Do" }), "dev3@silo.test,");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await waitFor(() => expect(mail.state.calls.send).toEqual(["d_2"]));
  expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ id: "d_2" });
});

it("puts the old account back on 409 draft_account_locked", async () => {
  const { mail, user } = setup();
  server.use(
    http.put("*/api/v1/drafts/:id", () =>
      Response.json(
        { status: 409, code: "draft_account_locked", title: "Conflict" },
        { status: 409 },
      ),
    ),
  );
  const win = await openCompose(user);
  await user.selectOptions(from(win), "acc_2");
  expect(await screen.findByText(/wysyła się z konta oryginalnej wiadomości/)).toBeInTheDocument();
  await waitFor(() => expect(within(win).getByText("Dev One <dev1@silo.test>")).toBeVisible());
  // Locked now: no choice any more.
  expect(within(win).queryByRole("combobox", { name: "Od" })).toBeNull();
  expect([...mail.state.drafts.keys()]).toEqual(["d_1"]);
});

it("hides Od for a reply", async () => {
  const { user } = setup("/u/0/inbox/t_2");
  await screen.findByRole("heading", { name: "Temat 2" });
  await user.keyboard("r");
  const win = await screen.findByRole("dialog", { name: "Re: Temat 2" });
  expect(within(win).queryByRole("combobox", { name: "Od" })).toBeNull();
  expect(within(win).getByText("Dev One <dev1@silo.test>")).toBeInTheDocument();
});

it("follows draft.updated with previousDraftId from another tab", async () => {
  composeConfig.autosaveMs = 50;
  const { mail, user } = setup();
  const win = await openCompose(user);
  // Another tab moved d_1 to acc_2 as d_9.
  const d = mail.state.drafts.get("d_1")!;
  mail.state.drafts.delete("d_1");
  mail.state.drafts.set("d_9", { ...d, id: "d_9", accountId: "acc_2", version: 2 });
  act(() =>
    FakeEventSource.latest().emit("draft.updated", {
      draftId: "d_9",
      previousDraftId: "d_1",
      version: 2,
      source: "silo",
      origin: "another-tab",
    }),
  );
  await waitFor(() => expect(mail.state.calls.getDraft).toContain("d_9"));
  await waitFor(() => expect(from(win).value).toBe("acc_2"));
  await user.type(within(win).getByRole("textbox", { name: "Temat" }), "Dalej");
  // Autosaves go to the new id with the moved draft's version (typing may save in parts).
  await waitFor(() =>
    expect(mail.state.calls.putDraft.at(-1)).toMatchObject({ id: "d_9", subject: "Dalej" }),
  );
  expect(mail.state.calls.putDraft[0]).toMatchObject({ id: "d_9", version: 2 });
});
