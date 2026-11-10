import { expect, test, type Page } from "@playwright/test";
import { escapeRe, login, rowOf } from "./support/app";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, runTag } from "./support/imap";

/**
 * Gmail-style list cues: the red "Draft" after the senders of a thread with an unsent reply
 * (Thread.draftCount, live through thread.updated) and the unread count on the favicon.
 */
const tag = runTag("draft-marker");
const { dev1, dev2 } = accounts;

test.afterAll(async () => {
  await deleteTagged(dev2, tag);
});

const favicon = (page: Page) =>
  page.locator('link[rel="icon"]').evaluate((l) => l.getAttribute("href") ?? "");

test("a started reply marks the row as Draft until it is discarded; the favicon has a badge", async ({
  page,
}) => {
  const subject = `${tag} Szkic odpowiedzi`;
  await appendMessage(dev2, "inbox", {
    from: `Dev One <${dev1.email}>`,
    to: dev2.email,
    subject,
    text: "Odpowiesz później?",
    messageId: `<e2e-draft-marker-${Date.now()}@silo.test>`,
  });

  await login(page, dev2);
  const row = rowOf(page, subject);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText("Draft", { exact: true })).toHaveCount(0);
  // At least this thread is unread: the favicon carries the badge (an SVG data URL).
  await expect.poll(() => favicon(page)).toMatch(/^data:image\/svg\+xml/);

  await row.click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await page.keyboard.press("r");
  const win = page.getByRole("region", { name: `Re: ${subject}` });
  await win.getByRole("textbox", { name: "Message body" }).click();
  await page.keyboard.type("Tak, jutro.");
  await page.getByRole("button", { name: "Back to list" }).click();

  // The row shows the draft in red after the senders, without a reload.
  const marker = row.getByText("Draft", { exact: true });
  await expect(marker).toBeVisible();
  await expect(row).toHaveAttribute("aria-label", new RegExp(`, Draft, ${escapeRe(subject)}`));

  // Discarding the draft removes the marker again.
  await row.click();
  await page.getByRole("button", { name: /Draft/ }).first().click();
  const compose = page.getByRole("dialog", { name: `Re: ${subject}` });
  await compose.getByRole("button", { name: "Discard draft" }).click();
  await expect(page.getByRole("status").getByText("Draft discarded")).toBeVisible();
  await page.getByRole("button", { name: "Back to list" }).click();
  await expect(rowOf(page, subject)).toBeVisible();
  await expect(rowOf(page, subject).getByText("Draft", { exact: true })).toHaveCount(0);
});
