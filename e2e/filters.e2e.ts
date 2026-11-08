import { expect, test, type Page } from "@playwright/test";
import { escapeRe, login, rowOf } from "./support/app";
import { deleteFiltersNamed, deleteLabelsNamed } from "./support/api";
import { accounts } from "./support/env";
import {
  appendMessage,
  deleteTagged,
  findMessages,
  hasKeyword,
  runTag,
  waitForMessage,
} from "./support/imap";

/**
 * DoD Faza 4, filters: "Filtr from:x → pomiń Odebrane + etykieta Y działa dla nowych wiadomości
 * (na serwerze: Archive + keyword) i wstecz po »apply«". The label and the filter are made in
 * Settings; mail from x is delivered with APPEND; the mail server is checked over IMAP.
 *
 * The label name is letters and digits only, so its IMAP keyword is the same word (plan 3.7
 * slug; the dev accounts have no keyword prefix).
 */
const tag = runTag("filters");
const uniq = Math.random().toString(36).slice(2, 8);
const labelY = `Filtr${uniq}`;
const filterName = `${tag} od x`;
const x = `x.${uniq}@example.com`;
const { dev1 } = accounts;

test.afterAll(async () => {
  await deleteFiltersNamed(dev1, tag);
  await deleteLabelsNamed(dev1, labelY);
  await deleteTagged(dev1, tag);
});

async function createLabel(page: Page, name: string) {
  await page.goto("/u/0/settings/labels");
  await page.getByRole("button", { name: "New label" }).click();
  const dialog = page.getByRole("dialog", { name: "New label" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("listitem", { name })).toBeVisible();
}

test("from:x → skip the Inbox + label Y, for new mail and after apply", async ({ page }) => {
  test.setTimeout(4 * 60_000);
  // Mail from x that exists before the filter: only "apply" may touch it.
  const old = `${tag} stara`;
  await appendMessage(dev1, "inbox", { from: `X <${x}>`, to: dev1.email, subject: old, text: "." });
  await login(page, dev1);
  await expect(rowOf(page, old)).toBeVisible({ timeout: 20_000 });

  await createLabel(page, labelY);

  await page.goto("/u/0/settings/filters");
  await page.getByRole("button", { name: "Create a new filter" }).click();
  let dialog = page.getByRole("dialog", { name: "Create a new filter" });
  await dialog.getByRole("textbox", { name: "Filter name" }).fill(filterName);
  await dialog.getByRole("textbox", { name: "From" }).fill(x);
  await expect(dialog.locator(`p[aria-label="Criteria"]`)).toContainText(`from:${x}`);
  await dialog.getByRole("checkbox", { name: "Skip the Inbox (archive it)" }).check();
  await dialog.getByRole("checkbox", { name: labelY }).check();
  await dialog.getByRole("button", { name: "Save filter" }).click();
  await expect(dialog).toBeHidden();
  const item = page.getByRole("listitem", { name: filterName });
  await expect(item).toContainText(`archive, label ${labelY}`);

  // New mail from x: archived with the keyword Y on the server, labelled Y in Silo.
  const fresh = `${tag} nowa`;
  await appendMessage(dev1, "inbox", {
    from: `X <${x}>`,
    to: dev1.email,
    subject: fresh,
    text: ".",
  });
  await waitForMessage(dev1, "archive", fresh, 60_000, (m) => hasKeyword(m.flags, labelY));
  expect(await findMessages(dev1, "inbox", fresh)).toHaveLength(0);
  // The old message is not touched by filter_eval (it predates the filter).
  expect(await findMessages(dev1, "inbox", old)).toHaveLength(1);

  await page.goto("/u/0/inbox");
  await expect(rowOf(page, old)).toBeVisible();
  await expect(rowOf(page, fresh)).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main menu" })
    .getByRole("link", { name: new RegExp(`^${escapeRe(labelY)}`) })
    .click();
  await expect(rowOf(page, fresh)).toBeVisible({ timeout: 15_000 });

  // Apply to existing mail: edit the filter and save it with "Also apply to matching conversations".
  await page.goto("/u/0/settings/filters");
  await page
    .getByRole("listitem", { name: filterName })
    .getByRole("button", { name: `Edit the filter ${filterName}` })
    .click();
  dialog = page.getByRole("dialog", { name: `Edit the filter ${filterName}` });
  await dialog.getByRole("checkbox", { name: "Also apply to matching conversations" }).check();
  await dialog.getByRole("button", { name: "Save filter" }).click();
  await expect(page.getByText(/^Filter applied to/)).toBeVisible({ timeout: 60_000 });
  await waitForMessage(dev1, "archive", old, 60_000, (m) => hasKeyword(m.flags, labelY));
  expect(await findMessages(dev1, "inbox", old)).toHaveLength(0);
  await page.goto("/u/0/inbox");
  await expect(rowOf(page, old)).toHaveCount(0);
});
