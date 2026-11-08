import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page } from "@playwright/test";
import { e2eEnv, type DevAccount } from "./env";

/** Signs in through the login page and waits for the Inbox list. */
export async function login(page: Page, account: DevAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  // The suite signs in often: the per-login throttle of silo-server (burst 8, one more every
  // 15 s) may answer 429; wait as the page says and try again.
  const throttled = page.getByRole("alert").filter({ hasText: /Too many sign-in attempts/ });
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const outcome = await Promise.race([
      page.waitForURL(/\/u\/0\/inbox/, { timeout: 15_000 }).then(
        () => "in",
        () => "timeout",
      ),
      throttled.waitFor({ timeout: 15_000 }).then(
        () => "throttled",
        () => "timeout",
      ),
    ]);
    if (outcome !== "throttled") break;
    const secs = Number(/in (\d+) s/.exec((await throttled.textContent()) ?? "")?.[1] ?? 15);
    await page.waitForTimeout((secs + 1) * 1000);
  }
  await expect(page).toHaveURL(/\/u\/0\/inbox/);
  await expect(page.getByRole("grid")).toBeVisible();
}

/** The row of a thread by (part of) its subject. */
export const rowOf = (page: Page, subject: string): Locator =>
  page.getByRole("row", { name: new RegExp(escapeRe(subject)) });

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Inbox counter in LeftNav (unread threads, as in Gmail); 0 when hidden. */
export async function inboxCount(page: Page): Promise<number> {
  const link = page.getByRole("navigation", { name: "Main menu" }).getByRole("link", {
    name: /^Inbox/,
  });
  const text = (await link.textContent()) ?? "";
  // Thousands are grouped with a comma (en) or a no-break space (pl, matched by \s).
  const m = /(\d[\d\s,]*)$/.exec(text.trim());
  return m ? Number(m[1]!.replace(/\D/g, "")) : 0;
}

/** Index of a row in the grid (aria-rowindex, 1-based). */
export async function rowIndex(row: Locator): Promise<number> {
  return Number(await row.getAttribute("aria-rowindex"));
}

/** `docker compose -f silo/docker-compose.dev.yml <args>` (the dev stack of the e2e run). */
export function compose(...args: string[]): string {
  const env = e2eEnv();
  return execFileSync("docker", ["compose", "-f", env.composeFile, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  });
}

/** Whether the IMAP port of the mailserver container accepts connections. */
export function mailserverReady(): boolean {
  try {
    return compose("exec", "-T", "mailserver", "ss", "-lnt").includes(":143 ");
  } catch {
    return false;
  }
}

/** The Inbox counter once it has not changed for `quietMs` (background sync settled). */
export async function stableInboxCount(page: Page, quietMs = 1_500): Promise<number> {
  let value = await inboxCount(page);
  let since = Date.now();
  const deadline = Date.now() + 30_000;
  while (Date.now() - since < quietMs && Date.now() < deadline) {
    await page.waitForTimeout(250);
    const v = await inboxCount(page);
    if (v !== value) {
      value = v;
      since = Date.now();
    }
  }
  return value;
}

/**
 * The first full minute at least `aheadMs` from now: its `datetime-local` value in the browser's
 * time zone (the field has minute precision) and the instant in ms since epoch.
 */
export async function minuteAhead(
  page: Page,
  aheadMs: number,
): Promise<{ value: string; at: number }> {
  return page.evaluate((ahead) => {
    const at = Math.ceil((Date.now() + ahead) / 60_000) * 60_000;
    const d = new Date(at);
    const p = (n: number) => String(n).padStart(2, "0");
    const value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    return { value, at };
  }, aheadMs);
}

/** "Pick date & time" of an open snooze / schedule-send menu: fills the dialog and saves. */
export async function pickDateTime(page: Page, title: string, value: string): Promise<void> {
  await page.getByRole("menuitem", { name: "Pick date & time" }).click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Date and time").fill(value);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

/** Thread ids of the list in row order (aria-rowindex; the virtualizer's DOM order may differ). */
export const rowIds = (page: Page) =>
  page.locator("[role=row][data-thread-id]").evaluateAll((rows) =>
    rows
      .map(
        (r) => [Number(r.getAttribute("aria-rowindex")), r.getAttribute("data-thread-id")] as const,
      )
      .sort((a, b) => a[0] - b[0])
      .map(([, id]) => id),
  );

/** Opens a view of the first account by its slug (inbox, snoozed, scheduled, l_…, settings/…). */
export async function openView(page: Page, slug: string): Promise<void> {
  await page.goto(`/u/0/${slug}`);
}
