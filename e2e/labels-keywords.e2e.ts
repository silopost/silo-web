import { expect, test } from "@playwright/test";
import { escapeRe, login, rowOf } from "./support/app";
import { deleteLabelsNamed } from "./support/api";
import { accounts } from "./support/env";
import {
  appendMessage,
  deleteTagged,
  hasKeyword,
  runTag,
  storeFlags,
  waitForMessage,
} from "./support/imap";

/**
 * DoD Faza 4, labels as IMAP keywords: "Etykieta nadana w Silo jest widoczna jako tag
 * w Thunderbirdzie (keyword); tag nadany w Thunderbirdzie pojawia się jako etykieta w Silo < 5 s
 * (INBOX)". The second IMAP client stands in for Thunderbird (its tags are keywords).
 *
 * Label names are letters and digits only, so the keyword equals the name (plan 3.7 slug, no
 * keyword prefix on the dev accounts).
 *
 * Not covered here: the `local_only` / `partial` warnings. They need a server without keywords
 * or a maildir folder with 26 keywords already in use; the dev mailserver keeps keywords and
 * a test must not fill dev1@'s INBOX keyword table (it is not cleaned by deleting messages).
 * silo-server covers both with Dovecot in its integration tests; the UI with vitest (msw).
 */
const tag = runTag("keywords");
const uniq = Math.random().toString(36).slice(2, 8);
const fromSilo = `Kw${uniq}`;
const fromOther = `E2eTag${uniq}`;
const { dev1 } = accounts;

test.afterAll(async () => {
  await deleteLabelsNamed(dev1, uniq);
  await deleteTagged(dev1, tag);
});

test("a label from Silo is a keyword on the server", async ({ page }) => {
  const subject = `${tag} z Silo`;
  await appendMessage(dev1, "inbox", {
    from: "Etykiety <et@example.com>",
    to: dev1.email,
    subject,
    text: ".",
  });
  await login(page, dev1);
  const row = rowOf(page, subject);
  await expect(row).toBeVisible({ timeout: 20_000 });

  await row.focus();
  await page.keyboard.press("l");
  const labels = page.getByRole("dialog", { name: "Etykiety" });
  await expect(labels).toBeVisible();
  await labels.getByRole("textbox", { name: "Nowa etykieta" }).fill(fromSilo);
  await labels.getByRole("button", { name: "Utwórz" }).click();
  await page.keyboard.press("Escape");
  await expect(row.getByText(fromSilo)).toBeVisible();

  // Flags are written back at once (no undo window for keywords).
  const { messages } = await waitForMessage(dev1, "inbox", subject, 20_000, (m) =>
    hasKeyword(m.flags, fromSilo),
  );
  expect(messages[0]!.flags.some((f) => f.toLowerCase() === fromSilo.toLowerCase())).toBe(true);
});

test("a tag from another client becomes a label in Silo within 5 s (INBOX)", async ({ page }) => {
  const subject = `${tag} z innego klienta`;
  await appendMessage(dev1, "inbox", {
    from: "Etykiety <et@example.com>",
    to: dev1.email,
    subject,
    text: ".",
  });
  await login(page, dev1);
  const row = rowOf(page, subject);
  await expect(row).toBeVisible({ timeout: 20_000 });

  // UID STORE +FLAGS (E2eTag…) as Thunderbird would when tagging.
  expect(await storeFlags(dev1, "inbox", subject, { add: [fromOther] })).toBe(1);
  const stored = Date.now();
  await expect(row.getByText(fromOther)).toBeVisible({ timeout: 5_000 });
  const took = Date.now() - stored;
  console.log(`[measure] keyword STORE in another client -> label on the row: ${took} ms`);
  test.info().annotations.push({ type: "keyword-to-label-ms", description: String(took) });
  expect(took).toBeLessThan(5_000);

  // It is an ordinary label of Silo now: in LeftNav and in Settings.
  await expect(
    page
      .getByRole("navigation", { name: "Menu główne" })
      .getByRole("link", { name: new RegExp(`^${escapeRe(fromOther)}`) }),
  ).toBeVisible();
  await page.goto("/u/0/settings/labels");
  await expect(page.getByRole("listitem", { name: fromOther })).toBeVisible();
});
