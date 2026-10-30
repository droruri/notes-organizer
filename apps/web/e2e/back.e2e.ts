import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test.use({ viewport: { width: 375, height: 812 } });

const openTaxonomy = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: /קטגוריות ותגיות/ }).click();
  await expect(page).toHaveURL(/\/taxonomy$/);
};

test('menu → Taxonomy → back returns to the notes list', async ({ page }) => {
  await signIn(page);
  await openTaxonomy(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
});

test('a tag opens the filtered list, and back returns to Taxonomy', async ({ page }) => {
  await signIn(page);
  await openTaxonomy(page);
  const cat = unique('קט');
  const tag = unique('תג');
  await page.getByRole('textbox', { name: 'קטגוריה חדשה' }).fill(cat);
  await page.getByRole('button', { name: 'הוספת קטגוריה' }).click();
  await page.getByRole('button', { name: `הוספת תגית ל${cat}` }).click();
  await page.getByRole('textbox', { name: `תגית חדשה ב${cat}` }).fill(tag);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await page.locator('button.chip-tag', { hasText: tag }).click();
  await expect(page).toHaveURL(/\/\?tag=/);
  await page.goBack();
  await expect(page).toHaveURL(/\/taxonomy$/);
});

test('reloading on /taxonomy stays on Taxonomy', async ({ page }) => {
  await signIn(page);
  await openTaxonomy(page);
  await page.reload();
  await expect(page).toHaveURL(/\/taxonomy$/);
});

test('list → add → suggest → review → back returns to the list', async ({ page }) => {
  await signIn(page);
  await composeNote(page, unique('גב'));
  await expect(page).toHaveURL(/\/review$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
});

test('open a note → back returns to the list; save → back does not reopen the editor', async ({
  page,
}) => {
  await signIn(page);
  const body = unique('פתיחה');
  await composeNote(page, body);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  await page.getByText(body).first().click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByText(body).first().click();
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/notes\//);
});
