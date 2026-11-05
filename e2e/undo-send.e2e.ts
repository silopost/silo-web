import { expect, test, type Page } from "@playwright/test";
import { login } from "./support/app";
import { accounts } from "./support/env";
import { deleteTagged, findMessages, runTag, waitForMessage } from "./support/imap";

/**
 * DoD Faza 3, undo send: "Cofnij" within the window → nothing reaches dev2@ (checked after 12 s)
 * and the compose window comes back with its content; without undo the message arrives within
 * 10 s after the window.
 */
const tag = runTag("undo-send");
const { dev1, dev2 } = accounts;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
  await deleteTagged(dev2, tag);
});

async function composeTo(page: Page, subject: string, text: string) {
  await page.keyboard.press("c");
  const win = page.getByRole("dialog", { name: "Nowa wiadomość" });
  await expect(win).toBeVisible();
  await win.getByRole("combobox", { name: "Do" }).fill(`${dev2.email},`);
  await win.getByRole("textbox", { name: "Temat" }).fill(subject);
  // The window is named after its subject from now on.
  const named = page.getByRole("dialog", { name: subject });
  await named.getByRole("textbox", { name: "Treść wiadomości" }).click();
  await page.keyboard.type(text);
  return named;
}

/** Clicks Wyślij and returns undoUntil of the answer (ms since epoch). */
async function send(page: Page, win: ReturnType<Page["getByRole"]>) {
  const answer = page.waitForResponse((r) => /\/api\/v1\/drafts\/[^/]+\/send$/.test(r.url()));
  await win.getByRole("button", { name: "Wyślij" }).click();
  const res = await answer;
  expect(res.status()).toBe(200);
  return Date.parse(((await res.json()) as { undoUntil: string }).undoUntil);
}

test("Cofnij within the window: nothing is delivered, the window comes back", async ({ page }) => {
  await login(page, dev1);
  const subject = `${tag} cofnięta`;
  const win = await composeTo(page, subject, "Ta wiadomość nie powinna wyjść.");
  const undoUntil = await send(page, win);
  await expect(win).toBeHidden();
  await page.getByRole("status").getByRole("button", { name: "Cofnij" }).click();
  expect(Date.now()).toBeLessThan(undoUntil);

  const again = page.getByRole("dialog", { name: subject });
  await expect(again).toBeVisible();
  await expect(again.getByRole("textbox", { name: "Treść wiadomości" })).toContainText(
    "Ta wiadomość nie powinna wyjść.",
  );
  await expect(again.getByRole("list", { name: "Odbiorcy: Do" })).toContainText(dev2.email);
  await expect(page.getByRole("status").getByText("Wysyłanie cofnięte")).toBeVisible();

  await page.waitForTimeout(12_000);
  expect(await findMessages(dev2, "inbox", subject)).toHaveLength(0);
  await again.getByRole("button", { name: "Odrzuć wersję roboczą" }).click();
});

test("without Cofnij the message arrives within 10 s after the window", async ({ page }) => {
  await login(page, dev1);
  const subject = `${tag} wysłana`;
  const win = await composeTo(page, subject, "Ta wiadomość wychodzi.");
  const undoUntil = await send(page, win);
  const { at } = await waitForMessage(
    dev2,
    "inbox",
    subject,
    Math.max(0, undoUntil - Date.now()) + 15_000,
    () => true,
  );
  const afterWindow = at - undoUntil;
  console.log(
    `[measure] undo window end -> delivered to dev2@: ${afterWindow} ms (IMAP poll every 500 ms)`,
  );
  test.info().annotations.push({ type: "undo-send-delivery-ms", description: String(afterWindow) });
  expect(afterWindow).toBeLessThan(10_000);
});
