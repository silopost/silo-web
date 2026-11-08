import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createMockMail } from "../test/mockMail";
import { renderApp } from "../test/renderApp";
import { useUi } from "../state/ui";
import { KEYMAP, type ShortcutId } from "./keymap";

/** Plan 6.6: every shortcut of keymap.ts in its scope, and where shortcuts must not fire. */

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
  document.querySelectorAll("[data-test-field]").forEach((el) => el.remove());
});
afterAll(() => server.close());

type Mail = ReturnType<typeof createMockMail>;
type Ctx = ReturnType<typeof setup>;

function setup(url = "/u/0/inbox", prepare?: (mail: Mail) => void) {
  const mail = createMockMail();
  prepare?.(mail);
  server.use(...mail.handlers);
  const user = userEvent.setup();
  return { mail, user, ...renderApp(url) };
}

const labelsOf = (mail: Mail, id: string) => mail.state.threads.find((t) => t.id === id)!.labelIds;
const path = (c: Ctx) => c.router.state.location.pathname;
const rowEl = (id: string) =>
  document.querySelector<HTMLElement>(`[role=row][data-thread-id="${id}"]`);

/** The list with the cursor on t_2 (j from no cursor moves to the second row). */
async function listWithCursor(c: Ctx) {
  await screen.findByRole("row", { name: /Temat 5/ });
  await c.user.keyboard("j");
  await waitFor(() => expect(rowEl("t_2")).toHaveFocus());
}

async function thread() {
  await screen.findByRole("heading", { name: "Temat 3" });
  await screen.findAllByRole("article");
}

const secondAccount = (mail: Mail) => {
  mail.session.accounts!.push({
    ...mail.session.accounts![0]!,
    id: "acc_2",
    email: "dev2@silo.test",
    position: 1,
  });
};

const folder = (mail: Mail) => {
  mail.state.extraLabels.push(
    mail.makeLabel("l_f1", "Projekty", { type: "folder", folderId: "f_2", keywordState: null }),
    mail.makeLabel("l_u1", "Praca"),
  );
};

type Case = {
  id: ShortcutId;
  url?: string;
  prepare?: (mail: Mail) => void;
  run: (c: Ctx) => Promise<void>;
};

const CASES: Case[] = [
  {
    id: "compose",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard("c");
      expect(await screen.findByRole("dialog", { name: "New message" })).toBeInTheDocument();
    },
  },
  {
    id: "composeMaximized",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard("C");
      expect(await screen.findByRole("dialog", { name: "New message" })).toBeInTheDocument();
    },
  },
  {
    id: "search",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard("/");
      expect(document.getElementById("search-input")).toHaveFocus();
    },
  },
  {
    id: "help",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard("?");
      const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
      // Generated from the keymap, the keys the components handle included.
      expect(within(dialog).getByText("Next message in the conversation")).toBeInTheDocument();
      expect(within(dialog).getByText("Esc")).toBeInTheDocument();
      expect(within(dialog).getByText("Ctrl+Enter")).toBeInTheDocument();
    },
  },
  {
    id: "undo",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("e");
      await waitFor(() => expect(c.mail.state.calls.modify).toHaveLength(1));
      await c.user.keyboard("z");
      await waitFor(() => expect(c.mail.state.calls.undo).toEqual(["op_1"]));
    },
  },
  {
    id: "next",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("j");
      await waitFor(() => expect(rowEl("t_3")).toHaveFocus());
    },
  },
  {
    id: "prev",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("k");
      await waitFor(() => expect(rowEl("t_1")).toHaveFocus());
    },
  },
  {
    id: "open",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("o");
      await waitFor(() => expect(path(c)).toBe("/u/0/inbox/t_2"));
    },
  },
  {
    id: "back",
    url: "/u/0/inbox/t_3",
    run: async (c) => {
      await thread();
      await c.user.keyboard("u");
      await waitFor(() => expect(path(c)).toBe("/u/0/inbox"));
    },
  },
  {
    id: "select",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("x");
      expect(rowEl("t_2")).toHaveAttribute("aria-selected", "true");
    },
  },
  {
    id: "star",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("s");
      // t_2 is starred: s unstars it.
      await waitFor(() => expect(labelsOf(c.mail, "t_2")).not.toContain("STARRED"));
    },
  },
  {
    id: "archive",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("e");
      await waitFor(() => expect(labelsOf(c.mail, "t_2")).not.toContain("INBOX"));
    },
  },
  {
    id: "trash",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("#");
      await waitFor(() => expect(labelsOf(c.mail, "t_2")).toContain("TRASH"));
    },
  },
  {
    id: "spam",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("!");
      await waitFor(() => expect(labelsOf(c.mail, "t_2")).toContain("SPAM"));
    },
  },
  {
    id: "markRead",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("k");
      await waitFor(() => expect(rowEl("t_1")).toHaveFocus());
      await c.user.keyboard("I");
      await waitFor(() => expect(labelsOf(c.mail, "t_1")).not.toContain("UNREAD"));
    },
  },
  {
    id: "markUnread",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("U");
      await waitFor(() => expect(labelsOf(c.mail, "t_2")).toContain("UNREAD"));
    },
  },
  {
    id: "snooze",
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("b");
      expect(await screen.findByRole("menu", { name: "Snooze until…" })).toBeInTheDocument();
    },
  },
  ...(
    [
      ["reply", "r", "reply"],
      ["replyAll", "a", "replyAll"],
      ["forward", "f", "forward"],
    ] as const
  ).map(([id, key, mode]): Case => ({
    id,
    url: "/u/0/inbox/t_3",
    run: async (c) => {
      await thread();
      await c.user.keyboard(key);
      await waitFor(() =>
        expect(c.mail.state.calls.createDraft.at(-1)).toMatchObject({
          mode,
          replyToMessageId: "m_t_3_2",
        }),
      );
    },
  })),
  ...(
    [
      ["goInbox", "i", "/u/0/inbox"],
      ["goStarred", "s", "/u/0/starred"],
      ["goSent", "t", "/u/0/sent"],
      ["goDrafts", "d", "/u/0/drafts"],
      ["goAll", "a", "/u/0/all"],
    ] as const
  ).map(([id, key, to]): Case => ({
    id,
    url: id === "goInbox" ? "/u/0/starred" : "/u/0/inbox",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard(`g${key}`);
      await waitFor(() => expect(path(c)).toBe(to));
    },
  })),
  ...(
    [
      ["selectAll", "a", ["t_1", "t_2", "t_3", "t_4", "t_5"]],
      ["selectNone", "n", []],
      ["selectRead", "r", ["t_2", "t_3", "t_4", "t_5"]],
      ["selectUnread", "u", ["t_1"]],
      ["selectStarred", "s", ["t_2"]],
      ["selectUnstarred", "t", ["t_1", "t_3", "t_4", "t_5"]],
    ] as const
  ).map(([id, key, ids]): Case => ({
    id,
    run: async (c) => {
      await screen.findByRole("row", { name: /Temat 5/ });
      if (id === "selectNone") await c.user.keyboard("*a");
      await c.user.keyboard(`*${key}`);
      await waitFor(() => expect([...useUi.getState().selection].sort()).toEqual(ids));
    },
  })),
  {
    id: "nextMessage",
    url: "/u/0/inbox/t_3",
    run: async (c) => {
      await thread();
      // The cursor starts at the expanded (last) message: p goes up, n down again.
      await c.user.keyboard("p");
      await waitFor(() =>
        expect(document.querySelector('[data-message-id="m_t_3_1"]')).toHaveFocus(),
      );
      await c.user.keyboard("n");
      await waitFor(() =>
        expect(document.querySelector('[data-message-id="m_t_3_2"]')).toHaveFocus(),
      );
    },
  },
  {
    id: "prevMessage",
    url: "/u/0/inbox/t_3",
    run: async (c) => {
      await thread();
      await c.user.keyboard("p");
      await waitFor(() =>
        expect(document.querySelector('[data-message-id="m_t_3_1"]')).toHaveFocus(),
      );
      // Clamped at the first message.
      await c.user.keyboard("p");
      expect(document.querySelector('[data-message-id="m_t_3_1"]')).toHaveFocus();
    },
  },
  {
    id: "label",
    prepare: folder,
    run: async (c) => {
      await listWithCursor(c);
      await c.user.keyboard("l");
      const pop = await screen.findByRole("dialog", { name: "Label as" });
      await c.user.click(within(pop).getByRole("checkbox"));
      await waitFor(() =>
        expect(c.mail.state.calls.modify.at(-1)).toMatchObject({
          ids: ["t_2"],
          addLabelIds: ["l_u1"],
        }),
      );
    },
  },
  {
    id: "move",
    prepare: folder,
    url: "/u/0/inbox/t_3",
    run: async (c) => {
      await thread();
      await c.user.keyboard("v");
      const pop = await screen.findByRole("dialog", { name: "Move to" });
      await c.user.click(within(pop).getByRole("button", { name: "Projekty" }));
      await waitFor(() =>
        expect(c.mail.state.calls.modify.at(-1)).toEqual({
          ids: ["t_3"],
          addLabelIds: ["l_f1"],
          removeLabelIds: ["INBOX"],
        }),
      );
      await waitFor(() => expect(path(c)).toBe("/u/0/inbox"));
    },
  },
  {
    id: "goLabel",
    prepare: folder,
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard("gl");
      const dialog = await screen.findByRole("dialog", { name: "Go to label" });
      await c.user.type(within(dialog).getByRole("textbox", { name: "Filter labels" }), "proj");
      expect(
        within(dialog)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Projekty"]);
      await c.user.keyboard("{Enter}");
      await waitFor(() => expect(path(c)).toBe("/u/0/l_f1"));
      expect(screen.queryByRole("dialog", { name: "Go to label" })).toBeNull();
    },
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n): Case => ({
    id: `goAccount${n}` as ShortcutId,
    prepare: secondAccount,
    url: n === 1 ? "/u/1/inbox" : "/u/0/starred",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard(`g${n}`);
      // Two accounts: g 1 and g 2 go to them, g 3 … g 9 do nothing.
      const to = n === 1 ? "/u/0/inbox" : n === 2 ? "/u/1/inbox" : "/u/0/starred";
      await waitFor(() => expect(path(c)).toBe(to));
      expect(useUi.getState().pendingPrefix).toBeNull();
    },
  })),
  {
    id: "send",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard("c");
      const win = await screen.findByRole("dialog", { name: "New message" });
      await c.user.type(within(win).getByRole("combobox", { name: "To" }), "dev2@silo.test,");
      // In a field: the compose window handles it.
      await c.user.keyboard("{Control>}{Enter}{/Control}");
      await waitFor(() => expect(c.mail.state.calls.send).toEqual(["d_1"]));
    },
  },
  {
    id: "close",
    run: async (c) => {
      await screen.findByRole("grid");
      await c.user.keyboard("c");
      const win = await screen.findByRole("dialog", { name: "New message" });
      await c.user.type(within(win).getByRole("textbox", { name: "Subject" }), "x");
      await c.user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: /New message|x/ })).toBeNull(),
      );
      // Esc also leaves the SearchBox, so that the list keys work again.
      await c.user.keyboard("/");
      const search = document.getElementById("search-input")!;
      expect(search).toHaveFocus();
      await c.user.keyboard("{Escape}");
      expect(search).not.toHaveFocus();
    },
  },
];

describe("every shortcut of plan 6.6 in its scope", () => {
  it("the table covers the whole keymap", () => {
    const tested = new Set(CASES.map((c) => c.id));
    expect(KEYMAP.map((s) => s.id).filter((id) => !tested.has(id))).toEqual([]);
  });

  it.each(CASES.map((c) => [c.id, c] as const))("%s", async (_id, c) => {
    const ctx = setup(c.url, c.prepare);
    await c.run(ctx);
  });
});

it("g 1 on the first account goes to its inbox (from another view)", async () => {
  const c = setup("/u/0/starred", secondAccount);
  await screen.findByRole("grid");
  await c.user.keyboard("g1");
  await waitFor(() => expect(path(c)).toBe("/u/0/inbox"));
});

/** Fields where typing must not trigger shortcuts. */
const FIELDS: [string, () => HTMLElement][] = [
  ["input", () => addField("input")],
  ["textarea", () => addField("textarea")],
  [
    "[contenteditable]",
    () => {
      const el = addField("div");
      el.setAttribute("contenteditable", "true");
      el.tabIndex = 0; // focusable in jsdom too
      return el;
    },
  ],
  ["SearchBox", () => document.getElementById("search-input")!],
];

function addField(tag: "input" | "textarea" | "div"): HTMLElement {
  const el = document.createElement(tag);
  el.setAttribute("data-test-field", "");
  document.body.append(el);
  return el;
}

describe("shortcuts do not fire while typing", () => {
  it.each(FIELDS)("e # b c / x g i in %s", async (_name, field) => {
    const c = setup("/u/0/starred");
    await screen.findByRole("row", { name: /Temat 2/ });
    // A cursor on the row, then focus in the field.
    await c.user.keyboard("j");
    await waitFor(() => expect(rowEl("t_2")).toHaveFocus());
    const el = field();
    el.focus();
    await c.user.keyboard("e#bc/xgi");
    await new Promise((r) => setTimeout(r, 50));
    expect(c.mail.state.calls.modify).toEqual([]);
    expect(labelsOf(c.mail, "t_2")).toEqual(["INBOX", "STARRED"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(useUi.getState().selection.size).toBe(0);
    expect(useUi.getState().pendingPrefix).toBeNull();
    expect(path(c)).toBe("/u/0/starred");
    expect(el).toHaveFocus();
  });

  it("Esc and Ctrl+Enter work in the fields of the compose window", async () => {
    const c = setup();
    await screen.findByRole("grid");
    await c.user.keyboard("c");
    let win = await screen.findByRole("dialog", { name: "New message" });
    const subject = within(win).getByRole("textbox", { name: "Subject" });
    // Letters are text here.
    await c.user.type(subject, "e#c");
    expect(subject).toHaveValue("e#c");
    expect(c.mail.state.calls.modify).toEqual([]);
    await c.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /e#c/ })).toBeNull());

    await c.user.keyboard("c");
    win = await screen.findByRole("dialog", { name: "New message" });
    await c.user.type(within(win).getByRole("combobox", { name: "To" }), "dev2@silo.test,");
    act(() => within(win).getByRole("textbox", { name: "Message body" }).focus());
    await c.user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(c.mail.state.calls.send).toHaveLength(1));
  });
});

describe("keyboardShortcutsEnabled", () => {
  it("off: e and c do nothing; Esc and Ctrl+Enter in compose still work", async () => {
    const c = setup("/u/0/inbox", (mail) => {
      mail.session.settings!.keyboardShortcutsEnabled = false;
    });
    await screen.findByRole("row", { name: /Temat 5/ });
    rowEl("t_2")!.focus();
    await c.user.keyboard("ecgs");
    await new Promise((r) => setTimeout(r, 50));
    expect(c.mail.state.calls.modify).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(path(c)).toBe("/u/0/inbox");

    await c.user.click(screen.getByRole("button", { name: "Compose" }));
    const win = await screen.findByRole("dialog", { name: "New message" });
    await c.user.type(within(win).getByRole("combobox", { name: "To" }), "dev2@silo.test,");
    await c.user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(c.mail.state.calls.send).toHaveLength(1));
  });

  it("off: Esc closes the compose window", async () => {
    const c = setup("/u/0/inbox", (mail) => {
      mail.session.settings!.keyboardShortcutsEnabled = false;
    });
    await screen.findByRole("grid");
    await c.user.click(screen.getByRole("button", { name: "Compose" }));
    await screen.findByRole("dialog", { name: "New message" });
    await c.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("sequences", () => {
  it("the g prefix expires after 1500 ms", async () => {
    const c = setup("/u/0/starred");
    await screen.findByRole("grid");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.keyDown(document.body, { key: "g" });
    expect(useUi.getState().pendingPrefix).toBe("g");
    act(() => vi.advanceTimersByTime(1499));
    expect(useUi.getState().pendingPrefix).toBe("g");
    act(() => vi.advanceTimersByTime(2));
    expect(useUi.getState().pendingPrefix).toBeNull();
    // i alone is not a shortcut: no navigation.
    fireEvent.keyDown(document.body, { key: "i" });
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 50));
    expect(path(c)).toBe("/u/0/starred");

    // Within the window the sequence works.
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "i" });
    await waitFor(() => expect(path(c)).toBe("/u/0/inbox"));
  });
});
