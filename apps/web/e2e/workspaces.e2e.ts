import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

const openDialog = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'מרחבי עבודה' }).click();
  await expect(page.getByRole('dialog', { name: 'מרחבי עבודה' })).toBeVisible();
};

test('delete a workspace moves its notes to the default; rename and make default work', async ({
  page,
}) => {
  await signIn(page);
  const ws = unique('ידע');
  const body = unique('wsnote');
  await openDialog(page);
  const dialog = page.getByRole('dialog', { name: 'מרחבי עבודה' });
  await dialog.getByRole('textbox', { name: 'שם מרחב חדש' }).fill(ws);
  await dialog.getByRole('button', { name: 'הוספה' }).click();
  await dialog.getByRole('radio', { name: ws }).click();
  await expect(page.getByRole('heading', { name: ws, exact: true })).toBeVisible();

  await composeNote(page, body);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();

  await openDialog(page);
  const defaultRow = dialog.getByRole('radio', { name: /ברירת מחדל/ });
  const defaultName = ((await defaultRow.locator('span[dir=auto]').innerText()) ?? '').trim();

  // default row: no delete
  await dialog.getByRole('button', { name: `פעולות עבור ${defaultName}` }).click();
  await expect(dialog.getByRole('button', { name: 'שינוי שם' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'מחיקה' })).toHaveCount(0);
  await dialog.getByRole('button', { name: `פעולות עבור ${defaultName}` }).click();

  // rename: Escape cancels, Enter saves
  const renamed = `${ws} 2`;
  await dialog.getByRole('button', { name: `פעולות עבור ${ws}` }).click();
  await dialog.getByRole('button', { name: 'שינוי שם' }).click();
  const input = dialog.getByRole('textbox', { name: 'שם המרחב' });
  await input.fill(renamed);
  await input.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: ws, exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: `פעולות עבור ${ws}` }).click();
  await dialog.getByRole('button', { name: 'שינוי שם' }).click();
  await input.fill(renamed);
  await input.press('Enter');
  await expect(dialog.getByRole('radio', { name: renamed })).toBeVisible();

  // make default moves the pill, then move it back
  await dialog.getByRole('button', { name: `פעולות עבור ${renamed}` }).click();
  await dialog.getByRole('button', { name: 'קבע כברירת מחדל' }).click();
  await expect(dialog.getByRole('radio', { name: renamed })).toContainText('ברירת מחדל');
  await expect(dialog.getByRole('radio', { name: defaultName })).not.toContainText('ברירת מחדל');
  await dialog.getByRole('button', { name: `פעולות עבור ${defaultName}` }).click();
  await dialog.getByRole('button', { name: 'קבע כברירת מחדל' }).click();
  await expect(dialog.getByRole('radio', { name: defaultName })).toContainText('ברירת מחדל');

  // delete with inline confirm
  await dialog.getByRole('button', { name: `פעולות עבור ${renamed}` }).click();
  await dialog.getByRole('button', { name: 'מחיקה' }).click();
  await expect(dialog).toContainText(`למחוק את “${renamed}”?`);
  await expect(dialog).toContainText(`יעברו אל “${defaultName}”`);
  await dialog.getByRole('button', { name: 'מחיקה' }).click();
  await expect(dialog.getByRole('radio', { name: renamed })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: defaultName, exact: true })).toBeVisible();
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
});
