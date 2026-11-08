import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { withApi } from "./support/api";
import { login, rowOf } from "./support/app";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, findMessages, runTag, waitForMessage } from "./support/imap";

/**
 * DoD Faza 5 (plan 7): two accounts of one user. dev1 signs in and adds dev2@ in Ustawienia →
 * Konta (discovery, connection test, add); the AccountSwitcher shows both with their unread
 * counts; `g 2` switches to dev2's inbox; a message with Od = dev2 reaches dev3@ with
 * From: dev2@ and its copy is in dev2's Sent, not dev1's. The dev2 account is removed at the end.
 */
const tag = runTag("multi-account");
const { dev1, dev2, dev3 } = accounts;

type AccountRow = { id: string; email: string };

/** Removes dev2@ from dev1's user (left over from an earlier run, or at the end). */
async function removeDev2() {
  await withApi(dev1, async (api) => {
    const res = await api.get("/api/v1/accounts");
    const { accounts: list } = (await res.json()) as { accounts: AccountRow[] };
    for (const a of list.filter((x) => x.email === dev2.email)) {
      const del = await api.delete(`/api/v1/accounts/${a.id}`);
      expect(del.status()).toBe(204);
    }
    await api.patch("/api/v1/settings", { data: { activeAccountId: null } });
  });
}

const fromHeader = (source: string) => /^From:\s*([^\r\n]*)/im.exec(source)?.[1] ?? "";

test.beforeAll(removeDev2);

test.afterAll(async () => {
  await removeDev2();
  await deleteTagged(dev1, tag);
  await deleteTagged(dev2, tag);
  await deleteTagged(dev3, tag);
});

test("two accounts: add, switch, counts, send from the second", async ({ page }) => {
  // dev2 has an unread message of this run in its inbox.
  await appendMessage(dev2, "inbox", {
    from: `Dev Trzy <${dev3.email}>`,
    to: dev2.email,
    subject: `${tag} do dev2`,
    text: "Wiadomość w skrzynce drugiego konta.",
  });

  await login(page, dev1);

  // Ustawienia → Konta → Dodaj konto.
  await page.goto("/u/0/settings/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  const dialog = page.getByRole("dialog", { name: "Add account" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email address").fill(dev2.email);
  await dialog.getByLabel("Password").fill(dev2.password);
  await dialog.getByRole("button", { name: "Next" }).click();
  // Mode imap without custom servers: the default server of the instance, no network lookups.
  await expect(dialog.getByText("Settings found: default server")).toBeVisible();

  const axe = await new AxeBuilder({ page })
    .include("[role=dialog]")
    .setLegacyMode(true)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  console.log(
    `[measure] axe add-account: violations: ${axe.violations.map((v) => `${v.id} (${v.impact})`).join(", ") || "none"}`,
  );
  expect(serious.map((v) => v.id)).toEqual([]);

  await dialog.getByRole("button", { name: "Test connection" }).click();
  await expect(dialog.getByText("The connection works.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("listitem", { name: /^Sign-in, passed/ }).first()).toBeVisible();

  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page).toHaveURL(/\/u\/1\/inbox$/, { timeout: 30_000 });
  await expect(dialog).toBeHidden();
  // dev2's initial sync brings its inbox, with the message of this run.
  await expect(rowOf(page, `${tag} do dev2`)).toBeVisible({ timeout: 60_000 });

  // AccountSwitcher: both accounts with their own unread counts.
  await page.getByRole("button", { name: /^Account: dev2@silo\.test/ }).click();
  const menu = page.getByRole("menu");
  const item1 = menu.getByRole("menuitemradio", { name: /^dev1@silo\.test, / });
  const item2 = menu.getByRole("menuitemradio", { name: /^dev2@silo\.test, / });
  await expect(item1).toBeVisible();
  await expect(item2).toHaveAttribute("aria-label", /\d+ unread/);
  await expect(item2).toHaveAttribute("aria-checked", "true");
  console.log(
    `[measure] switcher: ${await item1.getAttribute("aria-label")} | ${await item2.getAttribute("aria-label")}`,
  );
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // g 1 / g 2 switch accounts (position 0 / 1).
  await page.keyboard.press("g");
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);
  await expect(rowOf(page, `${tag} do dev2`)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Account: dev1@silo\.test, .*in other accounts/ }),
  ).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("2");
  await expect(page).toHaveURL(/\/u\/1\/inbox$/);
  await expect(rowOf(page, `${tag} do dev2`)).toBeVisible();

  // Compose in dev2's tab: Od is dev2; switching it away and back moves the draft (new ids).
  await page.keyboard.press("c");
  const win = page.getByRole("dialog", { name: "New message" });
  await expect(win).toBeVisible();
  const from = win.getByRole("combobox", { name: "From" });
  await expect(from).toHaveValue(/^acc_/);
  await expect(from.locator("option:checked")).toHaveText(new RegExp(dev2.email));
  const moved = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/api\/v1\/drafts\//.test(r.url()),
  );
  // Options in the order of Account.position: dev1, dev2.
  const [acc1, acc2] = await from
    .locator("option")
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  await from.selectOption(acc1!);
  expect((await moved).status()).toBe(200);
  await expect(from.locator("option:checked")).toHaveText(new RegExp(dev1.email));
  const back = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/api\/v1\/drafts\//.test(r.url()),
  );
  await from.selectOption(acc2!);
  expect((await back).status()).toBe(200);
  await expect(from.locator("option:checked")).toHaveText(new RegExp(dev2.email));

  const subject = `${tag} z dev2`;
  await win.getByRole("combobox", { name: "To" }).fill(`${dev3.email},`);
  await win.getByRole("textbox", { name: "Subject" }).fill(subject);
  const named = page.getByRole("dialog", { name: subject });
  await named.getByRole("textbox", { name: "Message body" }).click();
  await page.keyboard.type("Wysłane z drugiego konta.");
  const sent = page.waitForResponse((r) => /\/api\/v1\/drafts\/[^/]+\/send$/.test(r.url()));
  await named.getByRole("button", { name: "Send", exact: true }).click();
  expect((await sent).status()).toBe(200);
  await expect(named).toBeHidden();

  // On the mail server: dev3 got it from dev2; dev2's Sent has the copy, dev1's has none.
  const delivered = await waitForMessage(dev3, "inbox", subject, 60_000);
  const from3 = fromHeader(delivered.messages[0]!.source);
  console.log(`[measure] dev3 From: ${from3}`);
  expect(from3).toContain(dev2.email);
  expect(from3).not.toContain(dev1.email);
  await waitForMessage(dev2, "sent", subject, 60_000);
  expect(await findMessages(dev1, "sent", subject)).toHaveLength(0);
});
