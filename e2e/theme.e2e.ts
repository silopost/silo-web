import { expect, test, type Page } from "@playwright/test";
import { login } from "./support/app";
import { getSettings, patchSettings } from "./support/api";
import { accounts } from "./support/env";

/**
 * Colour themes (settings.theme): a tile in Settings → General applies its theme at once, with
 * no reload; the choice survives a reload and a sign-out (the login screen keeps it), and reaches
 * another open session of the same user through settings.updated. The theme of dev1@ is put back
 * afterwards.
 */
const { dev1 } = accounts;
let original: unknown;

test.beforeAll(async () => {
  original = (await getSettings(dev1)).theme;
});

test.afterAll(async () => {
  await patchSettings(dev1, { theme: original ?? "default" });
});

const html = (page: Page) => page.locator("html");
const surface = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("a theme applies at once, survives a reload and a sign-out and reaches another session", async ({
  browser,
  page,
}) => {
  await patchSettings(dev1, { theme: "default" });
  await login(page, dev1);
  await page.goto("/u/0/settings/general");
  const group = page.getByRole("radiogroup", { name: "Theme" });
  await expect(group.getByRole("radio", { name: "Default" })).toBeChecked();
  await expect(html(page)).toHaveAttribute("data-theme", "default");
  const light = await surface(page);

  // A second session of the same user, in another browser context.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, dev1);
  await expect(html(other)).toHaveAttribute("data-theme", "default");

  const answer = page.waitForResponse(
    (r) => r.request().method() === "PATCH" && /\/api\/v1\/settings$/.test(r.url()),
  );
  await group.getByText("Dark", { exact: true }).click();
  // At once, before the answer, and without a reload.
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  expect(await surface(page)).not.toBe(light);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#131314");
  expect((await answer).status()).toBe(200);
  await expect(group.getByRole("radio", { name: "Dark" })).toBeChecked();

  // settings.updated: the other session follows without a reload.
  await expect(html(other)).toHaveAttribute("data-theme", "dark", { timeout: 15_000 });
  await otherContext.close();

  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Dark" }),
  ).toBeChecked();

  // Sign out: the login screen is dark from its first paint (public/theme-boot.js).
  await page.getByRole("button", { name: new RegExp(`^Account: ${dev1.email}`) }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

  // A browser without that memory takes the user's theme at sign-in.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "default");
  // login() waits out the sign-in throttle of the server (the suite signs in often).
  await login(page, dev1);
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});
