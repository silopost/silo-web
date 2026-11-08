import AxeBuilder from "@axe-core/playwright";
import { expect, request, test, type Page } from "@playwright/test";
import { accounts, e2eEnv } from "./support/env";
import { freshTotp } from "./support/totp";

/**
 * Mode local (plan 3.15, 7 Faza 5) on silo-server with SILO_AUTH_MODE=local
 * (silo/docker-compose.local-auth.yml over the silo-bt stack) and an admin created with
 * `silo-server user add --admin --password-stdin`: the admin turns TOTP on in Security,
 * signs in again with a code computed here (RFC 6238), creates a user in Administracja whose
 * temporary password is shown once; that user signs in in a second browser context, adds the
 * mailbox dev1@silo.test (mailserver:143 without TLS) and sees its INBOX. At the end the admin
 * removes the user and turns TOTP off with a backup code, so the run can be repeated.
 */
const admin = {
  email: process.env.SILO_E2E_ADMIN_EMAIL ?? "admin@silo.test",
  password: process.env.SILO_E2E_ADMIN_PASSWORD ?? "admin-e2e-password",
};
const newUser = `e2e-${Date.now().toString(36)}@silo.test`;
const { dev1 } = accounts;

/** What the run must undo when it stops half-way: TOTP of the admin and the new user. */
const leftovers: { secret?: string; usedStep: number; backup: string[] } = {
  usedStep: -1,
  backup: [],
};

const axe = async (page: Page, name: string) => {
  const result = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = result.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  console.log(
    `[measure] axe ${name}: violations: ${result.violations.map((v) => `${v.id} (${v.impact})`).join(", ") || "none"}`,
  );
  expect(serious.map((v) => v.id)).toEqual([]);
};

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to Silo" })).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Cleanup through the API when the UI part did not finish (bearer session of the admin). */
test.afterAll(async () => {
  const env = e2eEnv();
  const ctx = await request.newContext({ baseURL: env.apiUrl });
  const totpCode = leftovers.backup.pop();
  const res = await ctx.post("/api/v1/session", {
    data: {
      email: admin.email,
      password: admin.password,
      client: { kind: "bearer", name: "e2e cleanup" },
      ...(leftovers.secret && totpCode ? { totpCode } : {}),
    },
  });
  if (!res.ok()) {
    await ctx.dispose();
    return;
  }
  const { token, user } = (await res.json()) as { token: string; user: { totpEnabled: boolean } };
  const headers = { Authorization: `Bearer ${token}` };
  const users = (await (await ctx.get("/api/v1/admin/users", { headers })).json()) as {
    users: { id: string; email: string }[];
  };
  for (const u of users.users.filter((x) => x.email.startsWith("e2e-")))
    await ctx.delete(`/api/v1/admin/users/${u.id}`, { headers });
  const code = leftovers.backup.pop();
  if (user.totpEnabled && code)
    await ctx.delete("/api/v1/totp", { headers, data: { password: admin.password, code } });
  await ctx.delete("/api/v1/session", { headers });
  await ctx.dispose();
});

test("mode local: TOTP, admin creates a user, the user adds a mailbox", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);

  // 1. The admin signs in (no mail account yet) and turns TOTP on.
  await signIn(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);
  await expect(
    page.getByRole("heading", { name: "You don't have a mail account in Silo yet" }),
  ).toBeVisible();

  await page.goto("/u/0/settings/security");
  await page.getByRole("button", { name: "Turn on 2-Step Verification" }).click();
  await expect(page.getByRole("img", { name: "QR code for the authenticator app" })).toBeVisible();
  const secret = ((await page.getByTestId("totp-secret").textContent()) ?? "").replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await axe(page, "security");
  const enableCode = await freshTotp(secret);
  await page.getByLabel("App code").fill(enableCode.code);
  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  leftovers.secret = secret;
  leftovers.usedStep = enableCode.step;

  const codesDialog = page.getByRole("dialog", { name: "Backup codes" });
  await expect(codesDialog).toBeVisible();
  const backup = await codesDialog.getByRole("listitem").allTextContents();
  expect(backup).toHaveLength(10);
  leftovers.backup = [...backup];
  await codesDialog.getByRole("checkbox", { name: "I saved the codes" }).check();
  await codesDialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("totp-state")).toHaveText("On");

  // 2. Sign out and in again: password, then the app code.
  await page.getByRole("button", { name: new RegExp(`^Account: ${admin.email}`) }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, admin.email, admin.password);
  const codeField = page.getByLabel("App code");
  await expect(codeField).toBeFocused();
  const loginCode = await freshTotp(secret, leftovers.usedStep);
  leftovers.usedStep = loginCode.step;
  await codeField.fill(loginCode.code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);

  // 3. Administration → Add user: the temporary password is shown once.
  await page.getByRole("button", { name: new RegExp(`^Account: ${admin.email}`) }).click();
  await page.getByRole("menuitem", { name: "Administration" }).click();
  await expect(page.getByRole("table", { name: "Users" })).toBeVisible();
  await page.getByRole("button", { name: "Add user" }).click();
  const add = page.getByRole("dialog", { name: "Add user" });
  await add.getByLabel("Email").fill(newUser);
  await add.getByLabel("Display name (optional)").fill("Użytkownik e2e");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const temp = page.getByRole("dialog", { name: "Temporary password" });
  const tempPassword = ((await temp.getByLabel("Temporary password").textContent()) ?? "").trim();
  expect(tempPassword.length).toBeGreaterThanOrEqual(10);
  await temp.getByRole("button", { name: "Done" }).click();
  await expect(temp).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(newUser) })).toBeVisible();
  await axe(page, "admin users");

  // 4. The new user, in a second browser context: sign in, add dev1@ (mailserver:143, no TLS).
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signIn(page2, newUser, tempPassword);
  await expect(page2).toHaveURL(/\/u\/0\/inbox$/);
  await page2.getByRole("link", { name: "Add account" }).click();
  const dialog = page2.getByRole("dialog", { name: "Add account" });
  await dialog.getByLabel("Email address").fill(dev1.email);
  await dialog.getByLabel("Password").fill(dev1.password);
  await dialog.getByRole("button", { name: "Next" }).click();
  // Mode local runs the full discovery; silo.test has no public settings.
  await expect(dialog.getByText(/Settings found|No server settings found/)).toBeVisible({
    timeout: 20_000,
  });
  const advanced = dialog.getByRole("button", { name: /Advanced/ });
  if ((await advanced.getAttribute("aria-expanded")) !== "true") await advanced.click();
  for (const [proto, port] of [
    ["IMAP (incoming)", "143"],
    ["SMTP (outgoing)", "587"],
  ] as const) {
    await dialog.getByLabel(`${proto}: Serwer`).fill("mailserver");
    await dialog.getByLabel(`${proto}: Port`).fill(port);
    await dialog.getByLabel(`${proto}: Szyfrowanie`).selectOption("none");
  }
  await dialog.getByRole("button", { name: "Test connection" }).click();
  await expect(dialog.getByText("The connection works.")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page2).toHaveURL(/\/u\/0\/inbox$/, { timeout: 30_000 });
  await expect(page2.getByRole("grid")).toBeVisible();
  await expect(page2.getByRole("row").nth(1)).toBeVisible({ timeout: 60_000 });
  console.log(`[measure] ${newUser}: INBOX rows ${await page2.getByRole("row").count()}`);
  await other.close();

  // 5. Administracja → Konta lists the new account; the admin removes the user.
  await page.getByRole("link", { name: "Accounts" }).click();
  await expect(page.getByRole("row", { name: new RegExp(newUser) })).toBeVisible();
  await page.getByRole("link", { name: "Users" }).click();
  await page.getByRole("button", { name: `Actions: ${newUser}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const del = page.getByRole("dialog", { name: `Delete the user ${newUser}?` });
  await del.getByLabel(`Type ${newUser} to confirm`).fill(newUser);
  await del.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(newUser) })).toHaveCount(0);

  // 6. TOTP off again with a backup code (the run can be repeated on the same stack).
  await page.goto("/u/0/settings/security");
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  const off = page.getByRole("dialog", { name: "Turn off 2-Step Verification?" });
  await off.getByLabel("Password").fill(admin.password);
  await off.getByLabel("App or backup code").fill(leftovers.backup.shift()!);
  await off.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(page.getByTestId("totp-state")).toHaveText("Off");
  leftovers.secret = undefined;
  leftovers.backup = [];
});
