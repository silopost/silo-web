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
