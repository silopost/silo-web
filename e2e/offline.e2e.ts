import { expect, test } from "@playwright/test";
import { compose, login, mailserverReady, rowOf } from "./support/app";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, findMessages, runTag, waitUntil } from "./support/imap";

/**
 * DoD Faza 3: docker-mailserver stopped → archiving 3 threads works in the UI, the threads show
 * "oczekuje" and the account banner says the mail server is offline; after the server is back
 * the operations run on it and the icons go away without a reload.
 */
const tag = runTag("offline");
const { dev1 } = accounts;

test.afterAll(async () => {
  if (!mailserverReady()) {
    compose("start", "mailserver");
    await waitUntil(async () => mailserverReady(), 120_000, 2_000);
  }
  await deleteTagged(dev1, tag);
});

test("archive while the mail server is down, write-back after it is back", async ({ page }) => {
  test.setTimeout(420_000);
  const subjects = [1, 2, 3].map((n) => `${tag} wątek ${n}`);
  for (const subject of subjects) {
    await appendMessage(dev1, "inbox", {
      from: "Offline <offline@example.com>",
      to: dev1.email,
      subject,
      text: "Archiwizacja bez serwera poczty.",
    });
  }
  await login(page, dev1);
  for (const s of subjects) await expect(rowOf(page, s)).toBeVisible({ timeout: 15_000 });

  compose("stop", "mailserver");
  const stopped = Date.now();
  const banner = page.getByText(/Can't connect to the mail server/);
  await expect(banner).toBeVisible({ timeout: 90_000 });
  console.log(`[measure] mailserver stopped -> backoff banner: ${Date.now() - stopped} ms`);

  // Select the three rows and archive them with e.
  for (const s of subjects) await rowOf(page, s).getByRole("checkbox").check();
  // Keys typed in a checkbox are not shortcuts (plan 6.6): leave it first.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("e");
  for (const s of subjects) await expect(rowOf(page, s)).toHaveCount(0);
  await expect(page.getByRole("status").getByText(/archived/)).toBeVisible();

  // In "All Mail" the threads wait for the server: clock icon (after 3 s) and the row label.
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: /^All Mail/ }).click();
  for (const s of subjects) {
    await expect(rowOf(page, s)).toHaveAccessibleName(/Waiting to sync with the server/, {
      timeout: 20_000,
    });
    await expect(rowOf(page, s).getByTitle("Waiting to sync with the server")).toBeVisible();
  }
  await expect(banner).toContainText(/waiting/);

  compose("start", "mailserver");
  const started = Date.now();
  await waitUntil(async () => mailserverReady(), 120_000, 2_000);
  console.log(`[measure] mailserver start -> IMAP listening: ${Date.now() - started} ms`);

  // Without a reload: the pending marks go away as the operations run (SSE thread.updated).
  for (const s of subjects) {
    await expect(rowOf(page, s)).not.toHaveAccessibleName(/Waiting to sync with the server/, {
      timeout: 360_000,
    });
  }
  console.log(`[measure] mailserver start -> pending icons gone: ${Date.now() - started} ms`);
  await expect(banner).toBeHidden({ timeout: 30_000 });
  for (const s of subjects) {
    expect(await findMessages(dev1, "archive", s)).toHaveLength(1);
    expect(await findMessages(dev1, "inbox", s)).toHaveLength(0);
  }
});
