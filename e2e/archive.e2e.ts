import { expect, test, type Page } from "@playwright/test";
import { inboxCount, login, rowIndex, rowOf, stableInboxCount } from "./support/app";
import { accounts, e2eEnv } from "./support/env";
import { appendMessage, deleteTagged, findMessages, runTag, waitForMessage } from "./support/imap";

/**
 * DoD Faza 3: "Archiwizacja w Silo widoczna w Thunderbirdzie" – the row leaves the list at once,
 * the message is in Archive on the server within SILO_UNDO_WINDOW + 2 s, and "Undo" inside the
 * window keeps it in INBOX without any MOVE (same UID, nothing in Archive) and puts the row back
 * at its position.
 */
const env = e2eEnv();
const tag = runTag("archive");
const dev1 = accounts.dev1;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
});

/** Samples the Inbox counter after every change of the nav until stopped. */
async function watchInboxCounter(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __counter: string[] };
    w.__counter = [];
    const nav = document.querySelector("nav")!;
    const read = () => {
      const a = [...nav.querySelectorAll("a")].find((x) => x.textContent?.startsWith("Inbox"));
      const v = a?.textContent?.replace("Inbox", "").trim() ?? "";
      if (w.__counter.at(-1) !== v) w.__counter.push(v);
    };
    read();
    new MutationObserver(read).observe(nav, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __counter: string[] }).__counter.map(Number));
}

/**
 * Presses `e` on the row and measures, in the page, the time from the keydown to the row's
 * removal from the DOM and to the next animation frame after it (the frame that shows it).
 */
async function archiveWithE(page: Page, threadId: string) {
  await page.evaluate((id) => {
    const w = window as unknown as {
      __archive: { down?: number; removed?: number; frame?: number };
    };
    w.__archive = {};
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "e") w.__archive.down = performance.now();
      },
      { capture: true, once: true },
    );
    const obs = new MutationObserver(() => {
      if (!document.querySelector(`[role=row][data-thread-id="${id}"]`)) {
        w.__archive.removed = performance.now();
        obs.disconnect();
        requestAnimationFrame(() => (w.__archive.frame = performance.now()));
      }
    });
    obs.observe(document.body, { subtree: true, childList: true });
  }, threadId);
  await page.keyboard.press("e");
  const handle = await page.waitForFunction(() => {
    const a = (
      window as unknown as { __archive: { down?: number; removed?: number; frame?: number } }
    ).__archive;
    return a.frame !== undefined && a.down !== undefined && a.removed !== undefined
      ? { dom: a.removed - a.down, frame: a.frame - a.down }
      : null;
  });
  return (await handle.jsonValue())!;
}

/** Delivers a fresh thread to dev1's INBOX and waits for its row (via the event stream). */
async function freshThread(page: Page, name: string) {
  const subject = `${tag} ${name}`;
  await appendMessage(dev1, "inbox", {
    from: "Archiwista <archiwista@example.com>",
    to: dev1.email,
    subject,
    text: `Wiadomość do archiwizacji (${name}).`,
  });
  const row = rowOf(page, subject);
  await expect(row).toBeVisible({ timeout: 15_000 });
  return { subject, row, id: (await row.getAttribute("data-thread-id"))! };
}

test("e archives at once and the message reaches Archive on the server", async ({ page }) => {
  await login(page, dev1);
  const { subject, row, id } = await freshThread(page, "archive");
  const counter = await watchInboxCounter(page);
  const before = await stableInboxCount(page);
  await row.hover();
  await row.focus();

  const t = await archiveWithE(page, id);
  console.log(
    `[measure] e -> row removed from DOM: ${t.dom.toFixed(1)} ms, next frame: ${t.frame.toFixed(1)} ms`,
  );
  test.info().annotations.push({ type: "archive-dom-ms", description: t.dom.toFixed(1) });
  test.info().annotations.push({ type: "archive-frame-ms", description: t.frame.toFixed(1) });
  expect(t.dom).toBeLessThan(100);
  await expect(page.getByRole("status").getByText("Conversation archived")).toBeVisible();

  const t0 = Date.now();
  const { at } = await waitForMessage(dev1, "archive", subject, env.undoWindowMs + 2_000 + 3_000);
  console.log(
    `[measure] e -> message in Archive on the server: ${at - t0} ms (window ${env.undoWindowMs} ms)`,
  );
  expect(at - t0).toBeLessThanOrEqual(env.undoWindowMs + 2_000);
  expect(await findMessages(dev1, "inbox", subject)).toHaveLength(0);

  // The counter goes down by one (the thread was unread) and never jumps elsewhere.
  await expect.poll(() => inboxCount(page)).toBe(before - 1);
  const seen = await counter();
  console.log(`[measure] Inbox counter values after e: ${seen.join(" -> ")}`);
  expect(seen.every((v) => v === before || v === before - 1)).toBe(true);
});

test("Cofnij within the window: no MOVE on the server, the row returns to its place", async ({
  page,
}) => {
  await login(page, dev1);
  // Two threads: the archived one is the second row, so "its place" is not trivially the top.
  const target = await freshThread(page, "cofnij");
  await freshThread(page, "nad nim");
  const [onServer] = await findMessages(dev1, "inbox", target.subject);
  expect(onServer).toBeDefined();
  const index = await rowIndex(target.row);
  const counter = await watchInboxCounter(page);
  const before = await stableInboxCount(page);

  await target.row.focus();
  await archiveWithE(page, target.id);
  await expect(target.row).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(target.row).toBeVisible();
  expect(await rowIndex(target.row)).toBe(index);
  await expect.poll(() => inboxCount(page)).toBe(before);

  // Past the window plus the write-back time: still in INBOX with the same UID (a MOVE and a
  // move back would give a new UID) and nothing in Archive.
  await page.waitForTimeout(env.undoWindowMs + 4_000);
  const after = await findMessages(dev1, "inbox", target.subject);
  expect(after.map((m) => m.uid)).toEqual([onServer!.uid]);
  expect(await findMessages(dev1, "archive", target.subject)).toHaveLength(0);
  await expect(target.row).toBeVisible();
  const seen = await counter();
  console.log(`[measure] Inbox counter values after e and Cofnij: ${seen.join(" -> ")}`);
  expect(seen.every((v) => v === before || v === before - 1)).toBe(true);
});

test("counter stays consistent when an unread multi-message thread is archived from its view", async ({
  page,
}) => {
  await login(page, dev1);
  const subject = `${tag} watek`;
  const root = `<e2e-root-${Date.now()}@example.com>`;
  for (let i = 0; i < 3; i++) {
    await appendMessage(dev1, "inbox", {
      from: "Archiwista <archiwista@example.com>",
      to: dev1.email,
      subject: i === 0 ? subject : `Re: ${subject}`,
      text: `Część ${i + 1}`,
      messageId: i === 0 ? root : `<e2e-${i}-${Date.now()}@example.com>`,
      inReplyTo: i === 0 ? undefined : root,
    });
  }
  const row = rowOf(page, subject);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row)
    .toHaveAccessibleName(/3/, { timeout: 15_000 })
    .catch(() => undefined);
  const before = await stableInboxCount(page);
  const counter = await watchInboxCounter(page);

  await row.click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  // Opening marks it read: one unread thread less.
  await expect.poll(() => inboxCount(page)).toBe(before - 1);
  await page.keyboard.press("e");
  await expect(page.getByRole("status").getByText("Conversation archived")).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(await inboxCount(page)).toBe(before - 1);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(1_500);
  expect(await inboxCount(page)).toBe(before - 1);
  const seen = await counter();
  console.log(`[measure] Inbox counter, thread view (open, e, Cofnij): ${seen.join(" -> ")}`);
  expect(seen.every((v) => v === before || v === before - 1)).toBe(true);
});

test("right click → Move to → Archive moves the row like e", async ({ page }) => {
  await login(page, dev1);
  const { subject, row } = await freshThread(page, "menu");
  await row.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Conversation actions" });
  await menu.getByRole("menuitem", { name: "Move to" }).hover();
  await page
    .getByRole("menu", { name: "Move to" })
    .getByRole("menuitem", { name: "Archive" })
    .click();
  await expect(row).toHaveCount(0);
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("status").getByText("Conversation archived")).toBeVisible();
  await waitForMessage(dev1, "archive", subject, env.undoWindowMs + 2_000 + 3_000);
  expect(await findMessages(dev1, "inbox", subject)).toHaveLength(0);
});
