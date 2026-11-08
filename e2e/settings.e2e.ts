import { expect, test, type Page } from "@playwright/test";
import { login, rowOf } from "./support/app";
import { getSettings, patchSettings } from "./support/api";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, runTag } from "./support/imap";

/**
 * Faza 4, settings (PATCH /settings, plan 6.3): density, the undo-send period, the time zone and
 * the signature survive a reload; turning keyboard shortcuts off stops `e` from archiving; the
 * language switches at once and stays after a reload, a sign-out and a new sign-in.
 * The settings of dev1@ are put back as they were afterwards.
 */
const tag = runTag("settings");
const { dev1 } = accounts;
const keys = [
  "density",
  "undoSendSeconds",
  "timezone",
  "signature",
  "keyboardShortcutsEnabled",
  "language",
] as const;
let original: Record<string, unknown> = {};

test.beforeAll(async () => {
  const s = await getSettings(dev1);
  original = Object.fromEntries(keys.map((k) => [k, s[k]]));
});

test.afterAll(async () => {
  await patchSettings(dev1, original);
  await deleteTagged(dev1, tag);
});

/** Runs a change and waits for its PATCH /settings answer. */
async function saved(page: Page, change: () => Promise<unknown>) {
  const answer = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/api\/v1\/settings$/.test(r.url()),
  );
  await change();
  expect((await answer).status()).toBe(200);
}

/**
 * Opens Settings → General after its background GET /settings: a change made before that
 * answer could be overwritten by the older copy on screen.
 */
async function openGeneral(page: Page) {
  const loaded = page
    .waitForResponse(
      (r) => r.request().method() === "GET" && /\/api\/v1\/settings$/.test(r.url()),
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await page.goto("/u/0/settings/general");
  await loaded;
  await expect(page.getByRole("checkbox", { name: "Keyboard shortcuts on" })).toBeVisible();
}

/** Opens the Inbox and waits for the list, so that shortcuts are live. */
async function openInbox(page: Page) {
  await page.goto("/u/0/inbox");
  await expect(page.getByRole("grid")).toBeVisible();
}

test("general settings are saved and survive a reload", async ({ page }) => {
  await login(page, dev1);
  await openGeneral(page);

  const compact = original.density !== "compact";
  const density = compact ? "Compact" : "Comfortable";
  const undo = original.undoSendSeconds === 20 ? "30" : "20";
  const zone = original.timezone === "Asia/Tokyo" ? "America/New_York" : "Asia/Tokyo";
  const signatureText = `Pozdrawiam ${tag}`;

  await saved(page, () => page.getByRole("radio", { name: density }).check());
  await expect(page.locator("html")).toHaveAttribute(
    "data-density",
    compact ? "compact" : "comfortable",
  );
  await saved(page, () =>
    page.getByRole("combobox", { name: "Send cancellation period" }).selectOption(undo),
  );
  await saved(page, () => page.getByRole("combobox", { name: "Time zone" }).selectOption(zone));
  const signature = page.getByRole("textbox", { name: "Signature" });
  await signature.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(signatureText);
  await saved(page, () => page.getByRole("button", { name: "Save signature" }).click());

  await page.reload();
  await expect(page.getByRole("radio", { name: density })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute(
    "data-density",
    compact ? "compact" : "comfortable",
  );
  await expect(page.getByRole("combobox", { name: "Send cancellation period" })).toHaveValue(undo);
  await expect(page.getByRole("combobox", { name: "Time zone" })).toHaveValue(zone);
  await expect(page.getByRole("textbox", { name: "Signature" })).toContainText(signatureText);

  // The signature goes into a new message.
  await openInbox(page);
  await page.keyboard.press("c");
  const win = page.getByRole("dialog", { name: "New message" });
  await expect(win.getByRole("textbox", { name: "Message body" })).toContainText(signatureText);
  await win.getByRole("button", { name: "Discard draft" }).click();
});

test("with keyboard shortcuts off, e does not archive", async ({ page }) => {
  const subject = `${tag} skróty wyłączone`;
  await appendMessage(dev1, "inbox", {
    from: "Skróty <skroty@example.com>",
    to: dev1.email,
    subject,
    text: ".",
  });
  await login(page, dev1);
  await openGeneral(page);
  const box = page.getByRole("checkbox", { name: "Keyboard shortcuts on" });
  // click() + expect instead of check()/uncheck(): the controlled box shows the new state one
  // tick later (optimistic update of the settings query), which check() reads as "no change".
  if (!(await box.isChecked())) {
    await saved(page, () => box.click());
    await expect(box).toBeChecked();
  }
  await saved(page, () => box.click());
  await expect(box).not.toBeChecked();

  await openInbox(page);
  const row = rowOf(page, subject);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.focus();
  await page.keyboard.press("e");
  await page.waitForTimeout(1_000);
  await expect(row).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);

  // Back on: e archives again (undone at once with z).
  await openGeneral(page);
  const on = page.getByRole("checkbox", { name: "Keyboard shortcuts on" });
  await saved(page, () => on.click());
  await expect(on).toBeChecked();
  await openInbox(page);
  await row.focus();
  await page.keyboard.press("e");
  await expect(row).toHaveCount(0);
  // z undoes the operation of the snackbar: wait for the server's operationId.
  await expect(page.getByRole("status").getByRole("button", { name: "Undo" })).toBeVisible();
  await page.keyboard.press("z");
  await expect(row).toBeVisible();
});

test("Polski switches the UI at once and stays after a reload and a new login", async ({
  page,
}) => {
  await login(page, dev1);
  await openGeneral(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await saved(page, () => page.getByRole("combobox", { name: "Language" }).selectOption("pl"));
  // No reload: the same page is in Polish at once.
  await expect(page.getByRole("combobox", { name: "Język" })).toHaveValue("pl");
  await expect(page.getByRole("checkbox", { name: "Skróty klawiszowe włączone" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Ustawienia" })).toBeVisible();

  // Sign out: the login screen keeps the last language of the browser.
  await page.getByRole("button", { name: new RegExp(`^Konto: ${dev1.email}`) }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Zaloguj się" })).toBeVisible();

  // A browser without that memory starts in English and takes the setting at sign-in.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email address").fill(dev1.email);
  await page.getByLabel("Password").fill(dev1.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Menu główne" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Odebrane/ })).toBeVisible();

  await page.goto("/u/0/settings/general");
  await saved(page, () => page.getByRole("combobox", { name: "Język" }).selectOption("en"));
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveValue("en");
});
