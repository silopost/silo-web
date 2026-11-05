import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./support/app";
import { accounts } from "./support/env";

/**
 * Plan 6.7 / DoD Faza 3: axe without critical or serious violations on the login page, the list,
 * a thread and the compose window (WCAG 2.x A/AA rules).
 */
async function audit(page: Page, name: string) {
  // Message bodies (sandboxed srcdoc iframes) are mail content, not the app; axe's frame
  // handling also fails on them (Target.createTarget), so they are left out.
  const result = await new AxeBuilder({ page })
    .exclude("iframe[title^='Treść wiadomości']")
    .setLegacyMode(true)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const bad = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  const summary = result.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`);
  console.log(
    `[measure] axe ${name}: ${result.passes.length} passed rules, violations: ${summary.join(", ") || "none"}`,
  );
  test.info().annotations.push({ type: `axe-${name}`, description: summary.join(", ") || "none" });
  expect(
    bad.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 160)}`),
    })),
  ).toEqual([]);
}

test("axe: login, list, thread, compose", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Zaloguj", exact: true })).toBeVisible();
  await audit(page, "login");

  await login(page, accounts.dev1);
  await expect(page.getByRole("row").first()).toBeVisible();
  await audit(page, "list");

  await page.getByRole("row").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("iframe[title^='Treść wiadomości']").first()).toBeVisible();
  await audit(page, "thread");

  await page.keyboard.press("c");
  const win = page.getByRole("dialog", { name: "Nowa wiadomość" });
  await expect(win).toBeVisible();
  await audit(page, "compose");
  await win.getByRole("button", { name: "Zapisz i zamknij" }).click();
});
