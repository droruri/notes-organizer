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

test('chat opens as a page, and back closes it', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'שאלה' }).first().click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('dialog', { name: 'שאלות על הפתקים' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('chat → open a note → back returns to the list', async ({ page }) => {
  await signIn(page);
  const body = unique('צאט');
  await composeNote(page, body);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  await page.getByText(body).first().click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);
  const id = page.url().split('/notes/')[1];
  await page.goBack();
  await page.route(/\/chat$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `data: ${JSON.stringify({ type: 'text-delta', delta: `ראו [[note:${id}]]` })}\n\n`,
    });
  });
  await page.getByRole('button', { name: 'שאלה' }).first().click();
  const chat = page.getByRole('dialog', { name: 'שאלות על הפתקים' });
  await chat.getByRole('textbox', { name: 'שאלו על הפתקים…' }).fill('איפה?');
  await chat.getByRole('button', { name: 'שליחה' }).click();
  await chat.getByRole('button', { name: new RegExp(body.slice(0, 10)) }).click();
  await expect(page).toHaveURL(new RegExp(`/notes/${id}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('menu → Import → back closes the dialog', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: /ייבוא/ }).click();
  await expect(page).toHaveURL(/\/import$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
