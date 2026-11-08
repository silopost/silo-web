import { expect, test } from "@playwright/test";
import { login } from "./support/app";
import { accounts } from "./support/env";
import { decodedText, deleteTagged, findMessages, runTag, waitForMessage } from "./support/imap";

/**
 * DoD Faza 3: a draft written in Silo is in the server's Drafts folder within 35 s, always as
 * exactly one message; closing the window (syncNow) brings it there within seconds.
 */
const tag = runTag("drafts");
const { dev1 } = accounts;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
});

test("draft reaches Drafts ≤ 35 s, one version after edits, close syncs at once", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await login(page, dev1);
  const subject = `${tag} szkic`;
  await page.keyboard.press("c");
  await page
    .getByRole("dialog", { name: "New message" })
    .getByRole("textbox", { name: "Subject" })
    .fill(subject);
  // The window is named after its subject from now on.
  const win = page.getByRole("dialog", { name: subject });
  const body = win.getByRole("textbox", { name: "Message body" });
  await body.click();
  await page.keyboard.type("Pierwsza wersja.");
  const typed = Date.now();

  // 1. The autosaved draft appears in Drafts (2 s idle + 30 s sync delay).
  const first = await waitForMessage(dev1, "drafts", subject, 40_000, (m) =>
    decodedText(m.source).includes("Pierwsza wersja."),
  );
  const toDrafts = first.at - typed;
  console.log(`[measure] last keystroke -> draft in Drafts on the server: ${toDrafts} ms`);
  test.info().annotations.push({ type: "draft-to-drafts-ms", description: String(toDrafts) });
  expect(toDrafts).toBeLessThanOrEqual(35_000);
  expect(first.messages).toHaveLength(1);

  // 2. Another edit: after the next sync there is still exactly one message, the new one.
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Druga wersja.");
  const second = await waitForMessage(dev1, "drafts", subject, 40_000, (m) =>
    decodedText(m.source).includes("Druga wersja."),
  );
  expect(
    second.messages.filter((m) => decodedText(m.source).includes("Druga wersja.")),
  ).toHaveLength(1);
  // APPEND of the new version, then the old one is expunged: exactly one copy once settled.
  await expect
    .poll(async () => (await findMessages(dev1, "drafts", subject)).length, { timeout: 15_000 })
    .toBe(1);

  // 3. Edit and close at once (Esc): the last save carries syncNow.
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Trzecia wersja.");
  const save = page.waitForRequest(
    (r) =>
      r.method() === "PUT" &&
      /\/api\/v1\/drafts\//.test(r.url()) &&
      r.postDataJSON()?.syncNow === true,
  );
  await page.keyboard.press("Escape");
  const closed = Date.now();
  await save;
  await expect(win).toBeHidden();
  const third = await waitForMessage(dev1, "drafts", subject, 20_000, (m) =>
    decodedText(m.source).includes("Trzecia wersja."),
  );
  const onClose = third.at - closed;
  console.log(`[measure] close window (syncNow) -> new version in Drafts: ${onClose} ms`);
  test.info().annotations.push({ type: "draft-close-ms", description: String(onClose) });
  expect(onClose).toBeLessThan(10_000);
  // The old copy is removed with the new APPEND: one message after a moment.
  await expect
    .poll(async () => (await findMessages(dev1, "drafts", subject)).length, { timeout: 15_000 })
    .toBe(1);
});
