import AxeBuilder from "@axe-core/playwright";
import { expect, request, test, type Page } from "@playwright/test";
import { accounts, e2eEnv } from "./support/env";
import { freshTotp } from "./support/totp";

/**
 * Mode local (plan 3.15, 7 Faza 5) on silo-server with SILO_AUTH_MODE=local
 * (silo/docker-compose.local-auth.yml over the silo-bt stack) and an admin created with
 * `silo-server user add --admin --password-stdin`: the admin turns TOTP on in Bezpieczeństwo,
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
  await expect(page.getByRole("heading", { name: "Zaloguj się do Silo" })).toBeVisible();
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj", exact: true }).click();
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
    page.getByRole("heading", { name: "Nie masz jeszcze konta pocztowego w Silo" }),
  ).toBeVisible();

  await page.goto("/u/0/settings/security");
  await page.getByRole("button", { name: "Włącz weryfikację dwuetapową" }).click();
  await expect(
    page.getByRole("img", { name: "Kod QR do aplikacji uwierzytelniającej" }),
  ).toBeVisible();
  const secret = ((await page.getByTestId("totp-secret").textContent()) ?? "").replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await axe(page, "security");
  const enableCode = await freshTotp(secret);
  await page.getByLabel("Kod z aplikacji").fill(enableCode.code);
  await page.getByRole("button", { name: "Włącz", exact: true }).click();
  leftovers.secret = secret;
  leftovers.usedStep = enableCode.step;

  const codesDialog = page.getByRole("dialog", { name: "Kody zapasowe" });
  await expect(codesDialog).toBeVisible();
  const backup = await codesDialog.getByRole("listitem").allTextContents();
  expect(backup).toHaveLength(10);
  leftovers.backup = [...backup];
  await codesDialog.getByRole("checkbox", { name: "Zapisałem kody" }).check();
  await codesDialog.getByRole("button", { name: "Gotowe" }).click();
  await expect(page.getByTestId("totp-state")).toHaveText("Włączona");

  // 2. Sign out and in again: password, then the app code.
  await page.getByRole("button", { name: new RegExp(`^Konto: ${admin.email}`) }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, admin.email, admin.password);
  const codeField = page.getByLabel("Kod z aplikacji");
  await expect(codeField).toBeFocused();
  const loginCode = await freshTotp(secret, leftovers.usedStep);
  leftovers.usedStep = loginCode.step;
  await codeField.fill(loginCode.code);
  await page.getByRole("button", { name: "Potwierdź" }).click();
  await expect(page).toHaveURL(/\/u\/0\/inbox$/);

  // 3. Administracja → Dodaj użytkownika: the temporary password is shown once.
  await page.getByRole("button", { name: new RegExp(`^Konto: ${admin.email}`) }).click();
  await page.getByRole("menuitem", { name: "Administracja" }).click();
  await expect(page.getByRole("table", { name: "Użytkownicy" })).toBeVisible();
  await page.getByRole("button", { name: "Dodaj użytkownika" }).click();
  const add = page.getByRole("dialog", { name: "Dodaj użytkownika" });
  await add.getByLabel("E-mail").fill(newUser);
  await add.getByLabel("Nazwa wyświetlana (opcjonalnie)").fill("Użytkownik e2e");
  await add.getByRole("button", { name: "Dodaj", exact: true }).click();
  const temp = page.getByRole("dialog", { name: "Hasło tymczasowe" });
  const tempPassword = ((await temp.getByLabel("Hasło tymczasowe").textContent()) ?? "").trim();
  expect(tempPassword.length).toBeGreaterThanOrEqual(10);
  await temp.getByRole("button", { name: "Gotowe" }).click();
  await expect(temp).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(newUser) })).toBeVisible();
  await axe(page, "admin users");

  // 4. The new user, in a second browser context: sign in, add dev1@ (mailserver:143, no TLS).
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await signIn(page2, newUser, tempPassword);
  await expect(page2).toHaveURL(/\/u\/0\/inbox$/);
  await page2.getByRole("link", { name: "Dodaj konto" }).click();
  const dialog = page2.getByRole("dialog", { name: "Dodaj konto" });
  await dialog.getByLabel("Adres e-mail").fill(dev1.email);
  await dialog.getByLabel("Hasło").fill(dev1.password);
  await dialog.getByRole("button", { name: "Dalej" }).click();
  // Mode local runs the full discovery; silo.test has no public settings.
  await expect(dialog.getByText(/Ustawienia znalezione|Nie znaleziono ustawień/)).toBeVisible({
    timeout: 20_000,
  });
  const advanced = dialog.getByRole("button", { name: /Zaawansowane/ });
  if ((await advanced.getAttribute("aria-expanded")) !== "true") await advanced.click();
  for (const [proto, port] of [
    ["IMAP (odbieranie)", "143"],
    ["SMTP (wysyłanie)", "587"],
  ] as const) {
    await dialog.getByLabel(`${proto}: Serwer`).fill("mailserver");
    await dialog.getByLabel(`${proto}: Port`).fill(port);
    await dialog.getByLabel(`${proto}: Szyfrowanie`).selectOption("none");
  }
  await dialog.getByRole("button", { name: "Sprawdź połączenie" }).click();
  await expect(dialog.getByText("Połączenie działa.")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page2).toHaveURL(/\/u\/0\/inbox$/, { timeout: 30_000 });
  await expect(page2.getByRole("grid")).toBeVisible();
  await expect(page2.getByRole("row").nth(1)).toBeVisible({ timeout: 60_000 });
  console.log(`[measure] ${newUser}: INBOX rows ${await page2.getByRole("row").count()}`);
  await other.close();

  // 5. Administracja → Konta lists the new account; the admin removes the user.
  await page.getByRole("link", { name: "Konta" }).click();
  await expect(page.getByRole("row", { name: new RegExp(newUser) })).toBeVisible();
  await page.getByRole("link", { name: "Użytkownicy" }).click();
  await page.getByRole("button", { name: `Akcje: ${newUser}` }).click();
  await page.getByRole("menuitem", { name: "Usuń" }).click();
  const del = page.getByRole("dialog", { name: `Usunąć użytkownika ${newUser}?` });
  await del.getByLabel(`Wpisz ${newUser}, aby potwierdzić`).fill(newUser);
  await del.getByRole("button", { name: "Usuń", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(newUser) })).toHaveCount(0);

  // 6. TOTP off again with a backup code (the run can be repeated on the same stack).
  await page.goto("/u/0/settings/security");
  await page.getByRole("button", { name: "Wyłącz", exact: true }).click();
  const off = page.getByRole("dialog", { name: "Wyłączyć weryfikację dwuetapową?" });
  await off.getByLabel("Hasło").fill(admin.password);
  await off.getByLabel("Kod z aplikacji lub zapasowy").fill(leftovers.backup.shift()!);
  await off.getByRole("button", { name: "Wyłącz", exact: true }).click();
  await expect(page.getByTestId("totp-state")).toHaveText("Wyłączona");
  leftovers.secret = undefined;
  leftovers.backup = [];
});
