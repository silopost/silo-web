import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page } from "@playwright/test";
import { e2eEnv, type DevAccount } from "./env";

/** Signs in through the login page and waits for the Inbox list. */
export async function login(page: Page, account: DevAccount): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").fill(account.email);
  await page.getByLabel("Hasło").fill(account.password);
  await page.getByRole("button", { name: "Zaloguj", exact: true }).click();
  await expect(page).toHaveURL(/\/u\/0\/inbox/);
  await expect(page.getByRole("grid")).toBeVisible();
}

/** The row of a thread by (part of) its subject. */
export const rowOf = (page: Page, subject: string): Locator =>
  page.getByRole("row", { name: new RegExp(escapeRe(subject)) });

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Inbox counter in LeftNav (unread threads, as in Gmail); 0 when hidden. */
export async function inboxCount(page: Page): Promise<number> {
  const link = page.getByRole("navigation", { name: "Menu główne" }).getByRole("link", {
    name: /^Odebrane/,
  });
  const text = (await link.textContent()) ?? "";
  // Thousands are grouped with a no-break space (pl-PL); \s matches it.
  const m = /(\d[\d\s]*)$/.exec(text.trim());
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
