import { expect, test, type Page } from "@playwright/test";
import { login, minuteAhead, pickDateTime, rowIds, rowOf } from "./support/app";
import { accounts, e2eEnv } from "./support/env";
import {
  appendMessage,
  deleteTagged,
  findMessages,
  runTag,
  waitForMessage,
  waitUntil,
} from "./support/imap";

/**
 * DoD Faza 4, snooze: "Snooze »za 1 min« → wiadomość w folderze Snoozed na serwerze (Thunderbird
 * nie pokazuje jej w INBOX), po ≤ 90 s wraca do INBOX jako nieprzeczytana i wątek jest na górze
 * listy". Checked over IMAP as a second client. Plus: the Odłożone list with "Wybudź teraz" and
 * undo of a snooze from the snackbar.
 *
 * "za 1 min" is the first full minute at least 60 s ahead, picked in the date/time dialog (the
 * server presets are hours away; the field has minute precision), so the snooze lasts 60–120 s.
 * Tagged @slow: `npm run e2e -- --grep-invert @slow` skips it.
 */
const tag = runTag("snooze");
const { dev1 } = accounts;
const env = e2eEnv();

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
});

/** Opens the snooze menu of a row (hover action). */
async function snoozeMenu(page: Page, subject: string) {
  const row = rowOf(page, subject);
  await row.hover();
  await row.getByRole("button", { name: "Odłóż" }).click();
  const menu = page.getByRole("menu", { name: "Odłóż do…" });
  await expect(menu).toBeVisible();
  return menu;
}

test("Cofnij undoes a snooze; Wybudź teraz brings a thread back", async ({ page }) => {
  const subject = `${tag} cofnij i wybudź`;
  await appendMessage(dev1, "inbox", {
    from: "Odkładanie <odk@example.com>",
    to: dev1.email,
    subject,
    text: ".",
  });
  await login(page, dev1);
  await expect(rowOf(page, subject)).toBeVisible({ timeout: 20_000 });

  // Snooze with a server preset, then Cofnij in the snackbar: the row is back, nothing moves.
  let menu = await snoozeMenu(page, subject);
  await menu.getByRole("menuitem", { name: /^Jutro/ }).click();
  await expect(rowOf(page, subject)).toHaveCount(0);
  const snackbar = page.getByRole("status").filter({ hasText: /Wątek odłożony do/ });
  await snackbar.getByRole("button", { name: "Cofnij" }).click();
  await expect(rowOf(page, subject)).toBeVisible();
  await page.waitForTimeout(env.undoWindowMs + 3_000);
  expect(await findMessages(dev1, "inbox", subject)).toHaveLength(1);
  expect(await findMessages(dev1, "snoozed", subject)).toHaveLength(0);

  // Snooze again (no undo): the message goes to Snoozed after the undo window.
  menu = await snoozeMenu(page, subject);
  await menu.getByRole("menuitem", { name: /^Jutro/ }).click();
  await expect(rowOf(page, subject)).toHaveCount(0);
  await waitForMessage(dev1, "snoozed", subject, env.undoWindowMs + 20_000);
  expect(await findMessages(dev1, "inbox", subject)).toHaveLength(0);

  // Odłożone lists it with its wake time; Wybudź teraz moves it back to INBOX at once.
  await page.goto("/u/0/snoozed");
  const row = rowOf(page, subject);
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-label", /Odłożone do/);
  await row.hover();
  await expect(row.getByRole("button", { name: "Zmień termin" })).toBeVisible();
  await row.getByRole("button", { name: "Wybudź teraz" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("Wątek przeniesiony do Odebranych")).toBeVisible();
  await waitForMessage(dev1, "inbox", subject, 20_000);
  await page.goto("/u/0/inbox");
  await expect(rowOf(page, subject)).toBeVisible();
});

test(
  "snooze for a minute: in Snoozed on the server, back unread on top within 90 s",
  { tag: "@slow" },
  async ({ page }) => {
    test.setTimeout(6 * 60_000);
    const subject = `${tag} za minutę`;
    const newer = `${tag} nowsza`;
    // Read, so that waking has to take \Seen off; a newer thread above it.
    await appendMessage(
      dev1,
      "inbox",
      { from: "Odkładanie <odk@example.com>", to: dev1.email, subject, text: "Wróć za minutę." },
      ["\\Seen"],
    );
    await new Promise((r) => setTimeout(r, 1_100));
    await appendMessage(dev1, "inbox", {
      from: "Ktoś <ktos@example.com>",
      to: dev1.email,
      subject: newer,
      text: ".",
    });
    await login(page, dev1);
    await expect(rowOf(page, newer)).toBeVisible({ timeout: 20_000 });
    await expect(rowOf(page, subject)).toBeVisible();

    const menu = await snoozeMenu(page, subject);
    await expect(menu).toBeVisible();
    const { value, at: until } = await minuteAhead(page, 60_000);
    await pickDateTime(page, "Odłóż do…", value);
    await expect(rowOf(page, subject)).toHaveCount(0);

    // On the server: in Snoozed, not in INBOX (what Thunderbird shows), before the wake time.
    await waitForMessage(dev1, "snoozed", subject, env.undoWindowMs + 20_000);
    expect(await findMessages(dev1, "inbox", subject)).toHaveLength(0);
    expect(Date.now()).toBeLessThan(until);

    // Back in INBOX without \Seen within 90 s of the wake time.
    const { at } = await waitForMessage(
      dev1,
      "inbox",
      subject,
      until - Date.now() + 90_000,
      (m) => !m.flags.includes("\\Seen"),
    );
    const late = at - until;
    console.log(`[measure] snooze wake time -> back in INBOX unread: ${late} ms`);
    test.info().annotations.push({ type: "snooze-wake-ms", description: String(late) });
    expect(late).toBeLessThanOrEqual(90_000);
    expect(await findMessages(dev1, "snoozed", subject)).toHaveLength(0);

    // In Silo: unread and on top of the Inbox (sort_at = wake time), above the newer thread.
    await page.goto("/u/0/inbox");
    const row = rowOf(page, subject);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toHaveAttribute("aria-label", /Nieprzeczytane/);
    const id = await row.getAttribute("data-thread-id");
    await waitUntil(async () => (await rowIds(page))[0] === id, 10_000);
  },
);
