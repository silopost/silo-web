import { expect, test } from "@playwright/test";
import { login, rowOf } from "./support/app";
import { accounts } from "./support/env";
import {
  appendMessage,
  decodedText,
  deleteTagged,
  findMessages,
  runTag,
  waitForMessage,
} from "./support/imap";

/**
 * DoD Faza 3: sign in → read a thread of the seed → reply → the reply reaches dev2@ (IMAP) with
 * In-Reply-To/References → it is in the thread in Silo and in Sent on the server, once, with no
 * duplicate in Silo → the original has \Answered.
 */
const tag = runTag("reply");
const { dev1, dev2 } = accounts;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
  await deleteTagged(dev2, tag);
});

test("reads a seed thread", async ({ page }) => {
  await login(page, dev1);
  // seed/mail of silo: "Plan sprintu 47" (a thread of six messages).
  await page.getByRole("combobox", { name: "Search mail" }).fill("Plan sprintu 47");
  await page.keyboard.press("Enter");
  const row = page.getByRole("row", { name: /Plan sprintu 47/ }).first();
  await row.click();
  await expect(page.getByRole("heading", { name: /Plan sprintu 47/ })).toBeVisible();
  const frame = page.locator("iframe[title^='Message body']").last();
  await expect(frame).toBeVisible();
  await expect
    .poll(async () => (await frame.getAttribute("srcdoc"))?.length ?? 0)
    .toBeGreaterThan(50);
});

test("replies; delivery, headers, Sent copy and \\Answered checked over IMAP", async ({ page }) => {
  // The original comes from dev2@, so that the reply is delivered inside the dev stack.
  const subject = `${tag} Pytanie o termin`;
  const originalId = `<e2e-reply-${Date.now()}@silo.test>`;
  await appendMessage(dev1, "inbox", {
    from: `Dev Two <${dev2.email}>`,
    to: dev1.email,
    subject,
    text: "Czy termin w piątek jest aktualny?",
    messageId: originalId,
  });

  await login(page, dev1);
  const row = rowOf(page, subject);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();

  await page.keyboard.press("r");
  // The reply opens inline, under the message it answers.
  const win = page.getByRole("region", { name: `Re: ${subject}` });
  await expect(win).toBeVisible();
  await expect(win.getByRole("list", { name: "Recipients: To" })).toContainText(
    /Dev Two|dev2@silo\.test/,
  );
  const body = win.getByRole("textbox", { name: "Message body" });
  await body.click();
  await page.keyboard.type("Tak, piątek jest aktualny.");
  await win.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("status").getByText("Message sent")).toBeVisible();

  // Delivered to dev2@ after the undo-send window, with the threading headers.
  const t0 = Date.now();
  const { messages } = await waitForMessage(dev2, "inbox", `Re: ${subject}`, 40_000);
  console.log(`[measure] send -> delivered to dev2@: ${Date.now() - t0} ms`);
  expect(messages).toHaveLength(1);
  const reply = messages[0]!;
  expect(reply.inReplyTo).toBe(originalId);
  expect(reply.references).toContain(originalId);
  expect(decodedText(reply.source)).toContain("Tak, piątek jest aktualny.");

  // One copy in Sent on the server, the same message.
  const sent = await waitForMessage(dev1, "sent", `Re: ${subject}`, 20_000);
  expect(sent.messages).toHaveLength(1);
  expect(sent.messages[0]!.messageId).toBe(reply.messageId);

  // \Answered on the original.
  await waitForMessage(dev1, "inbox", subject, 20_000, (m) => m.flags.includes("\\Answered"));

  // In Silo: the thread has the original and the reply, once (the Sent copy was matched).
  await page.waitForTimeout(3_000);
  await page.reload();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(2);
  expect(await findMessages(dev1, "inbox", `Re: ${subject}`)).toHaveLength(0);
});
