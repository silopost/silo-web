import { expect, test, type Page } from "@playwright/test";
import { escapeRe, login, rowOf } from "./support/app";
import { deleteLabelsNamed } from "./support/api";
import { accounts } from "./support/env";
import { appendMessage, deleteTagged, runTag } from "./support/imap";

/**
 * Faza 4, search (plan 3.12, 6.3): Gmail operators on mail seeded over IMAP, suggestions
 * (history, contacts), chips, the advanced search and 422 for a stray `)`.
 *
 * Every query carries `uniq` (one word of every seeded subject), so other mail of dev1@ does
 * not change the expected results.
 */
const tag = runTag("search");
const uniq = `szk${Math.random().toString(36).slice(2, 8)}`;
const labelName = `Szukaj${uniq}`;
const { dev1 } = accounts;
const anna = `anna.${uniq}@example.com`;

const subjects = {
  a: `${tag} ${uniq} faktura marzec`,
  b: `${tag} ${uniq} umowa najmu`,
  c: `${tag} ${uniq} raport kwartalny`,
  d: `${tag} ${uniq} faktura kwiecień`,
};

test.afterAll(async () => {
  await deleteTagged(dev1, tag);
  await deleteLabelsNamed(dev1, labelName);
});

const box = (page: Page) => page.getByRole("combobox", { name: "Search mail" });

async function search(page: Page, q: string) {
  await box(page).fill(q);
  await box(page).press("Enter");
  await expect(page).toHaveURL(/\/u\/0\/search/);
}

/** Exactly the seeded threads `keys` are in the results (other results do not carry uniq). */
async function expectResults(page: Page, keys: (keyof typeof subjects)[]) {
  for (const k of keys) await expect(rowOf(page, subjects[k])).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("row", { name: new RegExp(escapeRe(uniq)) })).toHaveCount(
    keys.length,
  );
}

test("operators, suggestions, chips, advanced search and invalid queries", async ({ page }) => {
  // a: Anna, read; b: Bartek, unread; c: Anna with an attachment, read; d: Celina, read.
  await appendMessage(
    dev1,
    "inbox",
    { from: `Anna Szukająca <${anna}>`, to: dev1.email, subject: subjects.a, text: "Rozliczenie." },
    ["\\Seen"],
  );
  await appendMessage(dev1, "inbox", {
    from: `Bartek <bartek.${uniq}@example.com>`,
    to: dev1.email,
    subject: subjects.b,
    text: "Termin podpisania.",
  });
  await appendMessage(
    dev1,
    "inbox",
    {
      from: `Anna Szukająca <${anna}>`,
      to: dev1.email,
      subject: subjects.c,
      text: "W załączniku raport.",
      attachments: [{ filename: "raport.txt", contentType: "text/plain", content: "Q3: 42" }],
    },
    ["\\Seen"],
  );
  await appendMessage(
    dev1,
    "inbox",
    { from: `Celina <celina.${uniq}@example.com>`, to: dev1.email, subject: subjects.d, text: "." },
    ["\\Seen"],
  );

  await login(page, dev1);
  for (const s of Object.values(subjects)) {
    await expect(rowOf(page, s)).toBeVisible({ timeout: 20_000 });
  }

  // A plain word (prefix match on the subject) finds all four.
  await search(page, uniq);
  await expectResults(page, ["a", "b", "c", "d"]);
  // The body index may still be catching up on a fresh stack: the banner is optional.
  const indexing = page.getByText(/^Indexing message text: \d+%/);
  if (await indexing.count()) await expect(indexing).toContainText("results may be incomplete");

  await search(page, `${uniq} from:${anna}`);
  await expectResults(page, ["a", "c"]);
  // has:attachment works from the headers (BODYSTRUCTURE), before the body is downloaded.
  await search(page, `${uniq} has:attachment`);
  await expectResults(page, ["c"]);
  await search(page, `${uniq} is:unread`);
  await expectResults(page, ["b"]);
  await search(page, `${uniq} subject:umowa`);
  await expectResults(page, ["b"]);
  await search(page, `${uniq} faktura`);
  await expectResults(page, ["a", "d"]);
  await search(page, `${uniq} -faktura`);
  await expectResults(page, ["b", "c"]);
  await search(page, `${uniq} (umowa OR raport)`);
  await expectResults(page, ["b", "c"]);

  // label: after labelling d with a new label from the `l` popover.
  await search(page, `${uniq} kwiecień`);
  await expectResults(page, ["d"]);
  await rowOf(page, subjects.d).focus();
  await page.keyboard.press("l");
  const labels = page.getByRole("dialog", { name: "Label as" });
  await expect(labels).toBeVisible();
  await labels.getByRole("textbox", { name: "New label" }).fill(labelName);
  await labels.getByRole("button", { name: "Create" }).click();
  await page.keyboard.press("Escape");
  await expect(rowOf(page, subjects.d).getByText(labelName)).toBeVisible();
  await search(page, `${uniq} label:${labelName}`);
  await expectResults(page, ["d"]);

  // Suggestions: the history (first page of a search saves the query) and contacts.
  await page.goto("/u/0/inbox");
  await box(page).click();
  const list = page.getByRole("listbox", { name: "Search suggestions" });
  const recent = list.getByRole("group", { name: "Recent" });
  await expect(recent.getByRole("option", { name: `${uniq} faktura`, exact: true })).toBeVisible();
  await box(page).fill(`from:anna.${uniq}`);
  const contacts = list.getByRole("group", { name: "Contacts" });
  await expect(contacts.getByRole("option", { name: new RegExp(escapeRe(anna)) })).toBeVisible();
  // A history entry searches at once (the history lists only the 5 newest queries).
  await box(page).fill("");
  await recent.getByRole("option", { name: `${uniq} faktura`, exact: true }).click();
  await expect(page).toHaveURL(/\/u\/0\/search/);
  await expectResults(page, ["a", "d"]);

  // Chips: removing one part removes that text from q.
  await search(page, `from:${anna} ${uniq}`);
  await expectResults(page, ["a", "c"]);
  const chips = page.getByRole("list", { name: "Query terms" });
  await chips.getByRole("button", { name: `Remove from query: from:${anna}` }).click();
  await expectResults(page, ["a", "b", "c", "d"]);
  await expect(box(page)).toHaveValue(uniq);

  // The advanced search joins its fields into q.
  await page.getByRole("button", { name: "Show search options" }).click();
  const form = page.getByRole("dialog", { name: "Advanced search" });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "From" }).fill(anna);
  await form.getByRole("textbox", { name: "Has the words" }).fill(uniq);
  await form.getByRole("checkbox", { name: "Has attachment" }).check();
  await form.getByRole("button", { name: "Search" }).click();
  await expectResults(page, ["c"]);
  await expect(box(page)).toHaveValue(new RegExp(`from:${escapeRe(anna)}`));
  await expect(box(page)).toHaveValue(/has:attachment/);

  // 422 invalid_query: a closing bracket without its opening one, shown under the field.
  await search(page, `${uniq})`);
  await expect(page.getByRole("alert")).toContainText("Invalid query");
  await expect(box(page)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Couldn't load the list.")).toHaveCount(0);
});
