import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test('hiding the due date applies to the open form, the other form and survives reload', async ({
  page,
}) => {
  await signIn(page);
  const stored = unique('stored');
  const draft = unique('draft');
  const dueDate = page.getByLabel('תאריך יעד', { exact: true });

  await composeNote(page, stored);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card = page.locator('ul.gap-3 > li', { hasText: stored });
  await expect(card).toBeVisible();

  await composeNote(page, draft);
  await expect(dueDate).toBeVisible();
  await page.getByRole('textbox', { name: 'טקסט' }).fill(`${draft} extra`);
  await page.getByRole('button', { name: 'הגדרות טופס' }).click();
  const dialog = page.getByRole('dialog', { name: 'הגדרות טופס' });
  await expect(dialog.getByText('תמיד מוצג')).toBeVisible();
  await expect(dialog.getByRole('switch')).toHaveCount(5);
  await dialog.getByRole('switch', { name: 'הצגת תאריך יעד' }).uncheck();
  await dialog.getByRole('button', { name: 'שמירת הגדרות' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dueDate).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue(`${draft} extra`);

  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await card.getByText(stored).click();
  await expect(page.getByRole('heading', { name: 'עריכת פתק' })).toBeVisible();
  await expect(dueDate).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'עריכת פתק' })).toBeVisible();
  await expect(dueDate).toHaveCount(0);

  // restore the setting
  await page.getByRole('button', { name: 'הגדרות טופס' }).click();
  await page.getByRole('switch', { name: 'הצגת תאריך יעד' }).check();
  await page.getByRole('button', { name: 'שמירת הגדרות' }).click();
  await expect(dueDate).toBeVisible();
});
