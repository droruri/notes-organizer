import { expect, test, type Page } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test.use({ viewport: { width: 375, height: 812 } });

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};

/** Composes a note, sets its due date (if any) in the review form and saves it. */
async function seed(page: Page, body: string, dueDate: string | null) {
  await composeNote(page, body);
  if (dueDate) await page.getByLabel('תאריך יעד').fill(dueDate);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
}

test('Today tab shows the sections in order, and Back from a card returns to Today', async ({
  page,
}) => {
  await signIn(page);
  const tag = unique('t');
  await seed(page, `late ${tag}`, day(-2));
  await seed(page, `now ${tag}`, day(0));
  await seed(page, `busy ${tag}`, null);
  await seed(page, `soon ${tag}`, day(3));
  // Move "busy" to In progress with its status button (todo → in progress).
  await page
    .locator('li', { hasText: `busy ${tag}` })
    .getByRole('button', { name: /בתהליך/ })
    .click();
  await page.getByRole('button', { name: 'היום' }).click();
  await expect(page).toHaveURL(/\/\?view=today$/);
  const headings = page.getByRole('heading', { level: 3 });
  await expect(headings.filter({ hasText: /באיחור|להיום|בתהליך|ב־7 הימים הקרובים/ })).toHaveText([
    /באיחור/,
    /להיום/,
    /בתהליך/,
    /ב־7 הימים הקרובים/,
  ]);
  await page.getByText(`late ${tag}`).click();
  await expect(page).toHaveURL(/\/notes\/.+\?view=today$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/\?view=today$/);
  await expect(headings.first()).toBeVisible();
});

test('Today ends with a closed "to do, no date" row that opens to the undated to-dos', async ({
  page,
}) => {
  await signIn(page);
  const tag = unique('n');
  await seed(page, `someday ${tag}`, null);
  await page.getByRole('button', { name: 'היום' }).click();
  await expect(page).toHaveURL(/\/\?view=today$/);
  const row = page.getByRole('button', { name: /לביצוע, בלי תאריך/ });
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText(`someday ${tag}`)).toHaveCount(0);
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(`someday ${tag}`)).toBeVisible();
});

test('an in-progress note with no date stays under "in progress", not in the no-date row', async ({
  page,
}) => {
  await signIn(page);
  const tag = unique('p');
  await seed(page, `wip ${tag}`, null);
  await seed(page, `todo-nodate ${tag}`, null);
  await page
    .locator('li', { hasText: `wip ${tag}` })
    .getByRole('button', { name: /בתהליך/ })
    .click();
  await page.getByRole('button', { name: 'היום' }).click();
  await expect(page).toHaveURL(/\/\?view=today$/);
  await expect(page.getByRole('region', { name: 'בתהליך' }).getByText(`wip ${tag}`)).toBeVisible();
  const row = page.getByRole('button', { name: /לביצוע, בלי תאריך \(\d+\)/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(
    page.getByRole('region', { name: 'לביצוע, בלי תאריך' }).getByText(`todo-nodate ${tag}`),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'לביצוע, בלי תאריך' }).getByText(`wip ${tag}`),
  ).toHaveCount(0);
});
