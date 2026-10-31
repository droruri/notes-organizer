import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('note editor moves a note to another workspace and toasts; no select with one workspace', async ({
  page,
}) => {
  await signIn(page);
  const ws = unique('מרחב');
  const body = unique('movenote');

  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'מרחבי עבודה' }).click();
  const dialog = page.getByRole('dialog', { name: 'מרחבי עבודה' });
  await dialog.getByRole('textbox', { name: 'שם מרחב חדש' }).fill(ws);
  await dialog.getByRole('button', { name: 'הוספה' }).click();
  await expect(dialog.getByRole('radio', { name: ws })).toBeVisible();
  await page.keyboard.press('Escape');

  await composeNote(page, body);
  const wsSelect = page.getByLabel('סביבת עבודה');
  await expect(wsSelect).toBeVisible();
  expect(await wsSelect.evaluate((e) => e.tagName + '.' + e.className)).toContain('SELECT.field');
  await page.screenshot({ path: '/tmp/e2e-shots/editor-two-ws.png' });
  await wsSelect.selectOption({ label: ws });
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page.getByText(`נשמר ב‑${ws}`)).toBeVisible();
  await page.screenshot({ path: '/tmp/e2e-shots/toast.png' });
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toHaveCount(0);

  // switch to the new workspace: note is there
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'מרחבי עבודה' }).click();
  await dialog.getByRole('radio', { name: ws }).click();
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();

  // delete the workspace -> single workspace, no select
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'מרחבי עבודה' }).click();
  await dialog.getByRole('button', { name: `פעולות עבור ${ws}` }).click();
  await dialog.getByRole('button', { name: 'מחיקה' }).click();
  await dialog.getByRole('button', { name: 'מחיקה' }).click();
  await expect(dialog.getByRole('radio', { name: ws })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await composeNote(page, unique('single'));
  await expect(page.getByRole('button', { name: 'שמירה', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'בדיקת הפתק' })).toBeVisible();
  await expect(page.getByLabel('סביבת עבודה')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/e2e-shots/editor-one-ws.png' });
});
