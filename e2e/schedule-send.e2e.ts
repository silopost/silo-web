import { expect, test, type Page } from "@playwright/test";
import { login, minuteAhead, pickDateTime, rowOf } from "./support/app";
import { accounts } from "./support/env";
import {
  deleteTagged,
  findEverywhere,
  findMessages,
  runTag,
  waitForMessage,
  waitUntil,
} from "./support/imap";

/**
 * DoD Faza 4, schedule send: "Wiadomość zaplanowana na »za 2 min« nie pojawia się na serwerze
 * (w żadnym folderze) przed czasem i jest dostarczona w ±30 s". dev1@ schedules a message to
 * dev2@; a second IMAP client watches every folder of dev1@ and the INBOX of dev2@. Plus the
 * Zaplanowane list and "Cancel send", which reopens the message in compose.
 *
 * "za 2 min" is the first full minute at least 120 s ahead (the date/time field has minute
 * precision). Tagged @slow: `npm run e2e -- --grep-invert @slow` skips it.
 */
const tag = runTag("schedule");
const { dev1, dev2 } = accounts;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
  await deleteTagged(dev2, tag);
});

async function composeTo(page: Page, subject: string, text: string) {
  await page.keyboard.press("c");
  const win = page.getByRole("dialog", { name: "New message" });
  await expect(win).toBeVisible();
  await win.getByRole("combobox", { name: "To" }).fill(`${dev2.email},`);
  await win.getByRole("textbox", { name: "Subject" }).fill(subject);
  const named = page.getByRole("dialog", { name: subject });
  await named.getByRole("textbox", { name: "Message body" }).click();
  await page.keyboard.type(text);
  return named;
}

/** Opens "Schedule send" of a compose window. */
async function scheduleMenu(page: Page, win: ReturnType<Page["getByRole"]>) {
  await win.getByRole("button", { name: "More send options" }).click();
  const menu = page.getByRole("menu", { name: "Schedule send" });
  await expect(menu).toBeVisible();
  return menu;
}

test(
  "scheduled in 2 minutes: nowhere on the server before, delivered within ±30 s",
  { tag: "@slow" },
  async ({ page }) => {
    test.setTimeout(6 * 60_000);
    await login(page, dev1);
    const subject = `${tag} za dwie minuty`;
    const win = await composeTo(page, subject, "Zaplanowana wiadomość.");
    await scheduleMenu(page, win);
    const { value, at: sendAt } = await minuteAhead(page, 120_000);
    const answer = page.waitForResponse((r) => /\/api\/v1\/drafts\/[^/]+\/send$/.test(r.url()));
    await pickDateTime(page, "Schedule send", value);
    const res = await answer;
    expect(res.status()).toBe(200);
    // undoUntil of a scheduled send is the send time.
    const undoUntil = Date.parse(((await res.json()) as { undoUntil: string }).undoUntil);
    expect(Math.abs(undoUntil - sendAt)).toBeLessThan(1_000);
    await expect(win).toBeHidden();
    await expect(page.getByText(/^Send scheduled for/)).toBeVisible();

    // Zaplanowane lists it with its time.
    await page.goto("/u/0/scheduled");
    await expect(rowOf(page, subject)).toHaveAttribute("aria-label", /Scheduled for/);

    // The draft autosaved while typing had a copy in Drafts; scheduling removes it (an imap_op).
    // From then on nothing may exist on the server until the send time.
    await waitUntil(async () => (await findEverywhere(dev1, subject)).length === 0, 30_000);
    while (Date.now() < sendAt - 5_000) {
      expect(await findEverywhere(dev1, subject), "dev1@ before the send time").toEqual([]);
      expect(await findMessages(dev2, "inbox", subject), "dev2@ before the send time").toEqual([]);
      await page.waitForTimeout(5_000);
    }

    const { at } = await waitForMessage(dev2, "inbox", subject, sendAt - Date.now() + 45_000);
    const offset = at - sendAt;
    console.log(`[measure] scheduled send time -> delivered to dev2@: ${offset} ms`);
    test.info().annotations.push({ type: "schedule-send-offset-ms", description: String(offset) });
    expect(Math.abs(offset)).toBeLessThanOrEqual(30_000);
    await waitForMessage(dev1, "sent", subject, 30_000);
  },
);

test("Anuluj wysyłkę in Zaplanowane reopens the message in compose", async ({ page }) => {
  await login(page, dev1);
  const subject = `${tag} anulowana`;
  const win = await composeTo(page, subject, "Ta wiadomość nie wyjdzie.");
  const menu = await scheduleMenu(page, win);
  await menu.getByRole("menuitem", { name: /Tomorrow morning/ }).click();
  await expect(win).toBeHidden();

  await page.goto("/u/0/scheduled");
  const row = rowOf(page, subject);
  await expect(row).toBeVisible();
  await row.hover();
  await row.getByRole("button", { name: "Cancel send" }).click();
  const again = page.getByRole("dialog", { name: subject });
  await expect(again).toBeVisible();
  await expect(again.getByRole("textbox", { name: "Message body" })).toContainText(
    "Ta wiadomość nie wyjdzie.",
  );
  await expect(page.getByText("Send cancelled")).toBeVisible();
  await expect(row).toHaveCount(0);
  await again.getByRole("button", { name: "Discard draft" }).click();
  expect(await findMessages(dev2, "inbox", subject)).toHaveLength(0);
});
