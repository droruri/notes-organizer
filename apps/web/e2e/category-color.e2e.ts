import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test('changing a category color saves and shows on the collapsed note card', async ({ page }) => {
  await signIn(page);
  const body = unique('colored');
  const category = unique('cat');
  const gone = unique('gone');

  await composeNote(page, body);
  await page.getByLabel('שם חדש').fill(category);
  await page.getByRole('button', { name: 'הוספה', exact: true }).click();
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card = page.locator('ul.gap-3 > li', { hasText: body });
  await expect(card).toBeVisible();

  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();
  await page.getByLabel('קטגוריה חדשה').fill(gone);
  await page.getByRole('button', { name: 'הוספת קטגוריה' }).click();
  await page.getByRole('button', { name: `מחיקת ${gone}` }).click();

  const group = page.getByRole('radiogroup', { name: `צבע של ${category}` });
  await expect(group.getByRole('radio')).toHaveCount(8);
  await expect(page.getByRole('radiogroup', { name: `צבע של ${gone}` })).toHaveCount(0);
  const box = await group.getByRole('radio').first().boundingBox();
  expect(box?.width).toBe(36);
  expect(box?.height).toBe(36);

  const put = page.waitForResponse(
    (r) => r.url().includes('/color') && r.request().method() === 'PUT',
  );
  await group.getByRole('radio', { name: 'ורוד' }).click();
  expect((await put).ok()).toBe(true);
  await expect(group.getByRole('radio', { name: 'ורוד' })).toHaveAttribute('aria-checked', 'true');
  await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'חזרה' }).click();
  await expect(card.locator('[data-color="pink"]')).toHaveText(category);
});
