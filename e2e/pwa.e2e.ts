import { expect, test } from "@playwright/test";
import { login, rowOf } from "./support/app";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, runTag } from "./support/imap";

/**
 * PWA (plan 1, 7 Faza 5) on the production build served by `vite preview` (a service worker
 * works on localhost): the worker registers and controls the page, the manifest is served;
 * after reading the inbox and one thread the browser goes offline, the reload shows the app
 * shell, the cached list, the thread's body and the offline banner; back online a reload works.
 */
const tag = runTag("pwa");
const { dev1 } = accounts;
const subject = `${tag} czytane offline`;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
});

test("service worker, manifest and offline reading from the cache", async ({ page, context }) => {
  test.setTimeout(120_000);
  await appendMessage(dev1, "inbox", {
    from: "PWA <pwa@example.com>",
    to: dev1.email,
    subject,
    text: "Treść dostępna bez sieci.",
  });

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({
    name: "Silo",
    display: "standalone",
    start_url: "/",
  });

  await login(page, dev1);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(new URL(scope).pathname).toBe("/");
  // clientsClaim(): the first install already controls the page; reload to be sure anyway.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Read the inbox and the thread online: their GET answers land in the cache.
  await expect(rowOf(page, subject)).toBeVisible({ timeout: 30_000 });
  await rowOf(page, subject).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  const body = page.frameLocator("iframe[title^='Treść wiadomości'] >> nth=-1");
  await expect(body.getByText("Treść dostępna bez sieci.")).toBeVisible();
  const threadUrl = page.url();
  await page.goBack();
  await expect(rowOf(page, subject)).toBeVisible();
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("silo-api-v1");
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  console.log(`[measure] pwa: cached API answers: ${cached.length}`);
  expect(cached.some((p) => p === "/api/v1/threads")).toBe(true);
  expect(cached.some((p) => p.endsWith("/html"))).toBe(true);
  expect(cached.some((p) => /\/(session|meta|events)/.test(p))).toBe(false);

  // Offline: the shell, the cached list and the offline banner.
  await context.setOffline(true);
  const started = Date.now();
  await page.reload();
  await expect(page.getByRole("button", { name: "Menu główne" })).toBeVisible();
  await expect(rowOf(page, subject)).toBeVisible({ timeout: 15_000 });
  console.log(`[measure] pwa: offline reload -> cached list: ${Date.now() - started} ms`);
  await expect(page.getByText("Brak połączenia z Silo. Ponawiam…")).toBeVisible({
    timeout: 30_000,
  });
  // The thread read before opens from the cache, body included.
  await page.goto(threadUrl);
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await expect(body.getByText("Treść dostępna bez sieci.")).toBeVisible();

  // Back online: a reload talks to the server again.
  await context.setOffline(false);
  await page.goto("/u/0/inbox");
  await expect(rowOf(page, subject)).toBeVisible();
  await expect(page.getByText("Brak połączenia z Silo. Ponawiam…")).toBeHidden({
    timeout: 30_000,
  });
});
