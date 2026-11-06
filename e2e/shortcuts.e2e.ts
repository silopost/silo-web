import { expect, test, type Page } from "@playwright/test";
import { login, rowOf } from "./support/app";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, runTag } from "./support/imap";

/**
 * Plan 6.6 / Faza 3: the basic shortcuts `j k o u e # s x z c r a f ?` from the real keyboard
 * (keyboard.press = CDP key events, as typed). `j` from the first row moves exactly one row.
 */
const tag = runTag("keys");
const { dev1 } = accounts;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
});

/** data-thread-id of the row with the cursor (the grid's tab stop, plan 6.7). */
const cursorId = (page: Page) =>
  page.locator("[role=row][tabindex='0']").getAttribute("data-thread-id");
/** Thread ids in list order (aria-rowindex; the virtualizer's DOM order may differ). */
const ids = (page: Page) =>
  page.locator("[role=row]").evaluateAll((rows) =>
    rows
      .map(
        (r) => [Number(r.getAttribute("aria-rowindex")), r.getAttribute("data-thread-id")] as const,
      )
      .sort((a, b) => a[0] - b[0])
      .map(([, id]) => id),
  );

test("shortcuts from the real keyboard", async ({ page }) => {
  // Three fresh threads on top of the Inbox (newest first: C, B, A).
  for (const n of ["A", "B", "C"]) {
    await appendMessage(dev1, "inbox", {
      from: "Skróty <skroty@example.com>",
      to: dev1.email,
      subject: `${tag} ${n}`,
      text: `Wątek ${n}`,
    });
    await new Promise((r) => setTimeout(r, 1_100)); // distinct Date: header, stable order
  }
  await login(page, dev1);
  await expect(rowOf(page, `${tag} A`)).toBeVisible({ timeout: 15_000 });
  const order = await ids(page);
  const first = order[0]!;
  expect(first).toBe(await rowOf(page, `${tag} C`).getAttribute("data-thread-id"));

  // The cursor starts on the first row; j moves exactly one row, k back.
  expect(await cursorId(page)).toBe(first);
  await page.keyboard.press("j");
  await expect(page.locator(`[role=row][data-thread-id="${order[1]}"]`)).toBeFocused();
  // Settled: still exactly one row down (no second move after the re-render).
  await page.waitForTimeout(300);
  expect(await cursorId(page)).toBe(order[1]);
  await page.keyboard.press("j");
  await expect(page.locator(`[role=row][data-thread-id="${order[2]}"]`)).toBeFocused();
  await page.keyboard.press("k");
  await page.keyboard.press("k");
  await expect(page.locator(`[role=row][data-thread-id="${first}"]`)).toBeFocused();
  expect(await cursorId(page)).toBe(first);

  // x selects the row under the cursor, again deselects.
  const firstRow = page.locator(`[role=row][data-thread-id="${first}"]`);
  await page.keyboard.press("x");
  await expect(firstRow).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("x");
  await expect(firstRow).toHaveAttribute("aria-selected", "false");

  // s stars, s again unstars.
  const star = firstRow.getByRole("button", { name: /gwiazdk/i });
  await page.keyboard.press("s");
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("s");
  await expect(star).toHaveAttribute("aria-pressed", "false");

  // e archives, z undoes; # moves to Trash, z undoes.
  await page.keyboard.press("e");
  await expect(firstRow).toHaveCount(0);
  await page.keyboard.press("z");
  await expect(firstRow).toBeVisible();
  await firstRow.focus();
  await page.keyboard.press("#");
  await expect(firstRow).toHaveCount(0);
  await expect(page.getByRole("status").getByText(/kosz/i)).toBeVisible();
  await page.keyboard.press("z");
  await expect(firstRow).toBeVisible();

  // o opens the thread, r / a / f open reply windows, Esc closes them, u goes back.
  await firstRow.focus();
  await page.keyboard.press("o");
  await expect(page.getByRole("heading", { name: `${tag} C` })).toBeVisible();
  for (const [key, title] of [
    ["r", `Re: ${tag} C`],
    ["a", `Re: ${tag} C`],
    ["f", `Fwd: ${tag} C`],
  ] as const) {
    await page.keyboard.press(key);
    const win = page.getByRole("dialog", { name: title });
    await expect(win).toBeVisible();
    await win.getByRole("button", { name: "Zapisz i zamknij" }).click();
    await expect(win).toBeHidden();
  }
  await page.keyboard.press("u");
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);

  // c opens compose; ? the shortcuts dialog.
  await page.keyboard.press("c");
  const compose = page.getByRole("dialog", { name: "Nowa wiadomość" });
  await expect(compose).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(compose).toBeHidden();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Skróty klawiszowe" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Skróty klawiszowe" })).toBeHidden();
});

/**
 * Plan 6.6, the rest of the keymap: n p l v, g l, g 1…9, Shift+I/U, ! b C /, the `g` and `*`
 * sequences, Ctrl+Enter and Esc, and the keys that must stay text in compose and the SearchBox.
 */
test("the remaining shortcuts of plan 6.6", async ({ page }) => {
  const root = `<${tag}-root@silo.test>`;
  await appendMessage(dev1, "inbox", {
    from: "Skróty <skroty@example.com>",
    to: dev1.email,
    subject: `${tag} rozmowa`,
    text: "Pierwsza",
    messageId: root,
  });
  await appendMessage(dev1, "inbox", {
    from: "Skróty <skroty@example.com>",
    to: dev1.email,
    subject: `Re: ${tag} rozmowa`,
    text: "Druga",
    inReplyTo: root,
  });
  await appendMessage(dev1, "inbox", {
    from: "Skróty <skroty@example.com>",
    to: dev1.email,
    subject: `${tag} do przeniesienia`,
    text: "Przenieś mnie",
  });
  await login(page, dev1);
  const talk = rowOf(page, `${tag} rozmowa`);
  const movable = rowOf(page, `${tag} do przeniesienia`);
  await expect(talk).toBeVisible({ timeout: 15_000 });
  await expect(movable).toBeVisible();

  // Typing in the SearchBox: letters stay text, Esc leaves the field.
  await page.keyboard.press("/");
  const search = page.locator("#search-input");
  await expect(search).toBeFocused();
  await page.keyboard.type("e#bcxgi");
  await expect(search).toHaveValue("e#bcxgi");
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(search).not.toBeFocused();
  await search.fill("");

  // * a selects all rows, * n none.
  await page.keyboard.press("*");
  await page.keyboard.press("a");
  await expect(page.locator("[role=row][aria-selected=true]").first()).toBeVisible();
  await page.keyboard.press("*");
  await page.keyboard.press("n");
  await expect(page.locator("[role=row][aria-selected=true]")).toHaveCount(0);

  // Shift+U / Shift+I on the cursor row.
  await movable.focus();
  await page.keyboard.press("Shift+U");
  await expect(movable).toHaveAttribute("aria-label", /Nieprzeczytane/);
  await page.keyboard.press("Shift+I");
  await expect(movable).not.toHaveAttribute("aria-label", /Nieprzeczytane/);

  // b opens the snooze picker; Esc closes it.
  await page.keyboard.press("b");
  await expect(page.getByRole("menu", { name: "Odłóż do…" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Odłóż do…" })).toBeHidden();

  // l: the labels popover for the cursor row; a new label is created and applied.
  const label = `${tag}-etykieta`;
  await movable.focus();
  await page.keyboard.press("l");
  const labels = page.getByRole("dialog", { name: "Etykiety" });
  await expect(labels).toBeVisible();
  await labels.getByRole("textbox", { name: "Nowa etykieta" }).fill(label);
  await labels.getByRole("button", { name: "Utwórz" }).click();
  await page.keyboard.press("Escape");
  await expect(labels).toBeHidden();

  // g l: the picker goes to the label.
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  const picker = page.getByRole("dialog", { name: "Idź do etykiety" });
  await expect(picker).toBeVisible();
  await page.keyboard.type(label);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/u\/0\/l_[0-9a-z]+$/);
  await expect(movable).toBeVisible();

  // g 9 (no ninth account) does nothing; g 1 goes to the first account's Inbox.
  await page.keyboard.press("g");
  await page.keyboard.press("9");
  await expect(page).toHaveURL(/\/u\/0\/l_[0-9a-z]+$/);
  await page.keyboard.press("g");
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);

  // g s / g t / g d / g a / g i.
  for (const [key, slug] of [
    ["s", "starred"],
    ["t", "sent"],
    ["d", "drafts"],
    ["a", "all"],
    ["i", "inbox"],
  ] as const) {
    await page.keyboard.press("g");
    await page.keyboard.press(key);
    await expect(page).toHaveURL(new RegExp(`/u/0/${slug}$`));
  }

  // v: move to Archiwum.
  await expect(movable).toBeVisible();
  await movable.focus();
  await page.keyboard.press("v");
  const move = page.getByRole("dialog", { name: "Przenieś do" });
  await expect(move).toBeVisible();
  await move.getByRole("button", { name: "Archiwum" }).click();
  await expect(movable).toHaveCount(0);

  // n / p move between the messages of a thread.
  await talk.focus();
  await page.keyboard.press("o");
  await expect(page.getByRole("heading", { name: new RegExp(`${tag} rozmowa`) })).toBeVisible();
  const messages = page.locator("[data-message-id]");
  await expect(messages).toHaveCount(2);
  await page.keyboard.press("p");
  await expect(messages.nth(0)).toBeFocused();
  await page.keyboard.press("n");
  await expect(messages.nth(1)).toBeFocused();

  // ! reports spam from the thread and goes back to the list.
  await page.keyboard.press("!");
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);
  await expect(talk).toHaveCount(0);
  await page.keyboard.press("z");
  await expect(talk).toBeVisible();

  // Shift+C: maximised compose. Letters in its fields are text; Esc closes it.
  await page.keyboard.press("Shift+C");
  const win = page.getByRole("dialog", { name: "Nowa wiadomość" });
  await expect(win).toBeVisible();
  const subject = win.getByRole("textbox", { name: "Temat" });
  await subject.focus();
  await page.keyboard.type("e#cgi");
  await expect(subject).toHaveValue("e#cgi");
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "e#cgi" })).toBeHidden();

  // Ctrl+Enter sends from the body of the compose window.
  await page.keyboard.press("c");
  const send = page.getByRole("dialog", { name: "Nowa wiadomość" });
  await expect(send).toBeVisible();
  await send.getByRole("combobox", { name: "Do" }).fill(`${dev1.email},`);
  await send.getByRole("textbox", { name: "Temat" }).fill(`${tag} wysłane skrótem`);
  await send.getByRole("textbox", { name: "Treść wiadomości" }).click();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText("Wiadomość wysłana")).toBeVisible();
});
