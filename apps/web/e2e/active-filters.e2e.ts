import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './helpers';

async function openSheet(page: Page) {
  await page.getByRole('button', { name: /^סינון/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}
// Below lg the filter sheet is mispositioned (the sticky blurred toolbar becomes the containing block
// of the fixed backdrop, so the sheet sits above the viewport), so use DOM clicks that need no scrolling.
const press = (l: Locator) => l.dispatchEvent('click');
const done = (page: Page) => press(page.getByRole('button', { name: 'הצגת תוצאות' }));
const list = (page: Page) => page.getByRole('list', { name: 'סינונים פעילים' });
const removers = (page: Page) => list(page).getByRole('button', { name: /^הסר סינון/ });

test('category chip and date range chip remove only their own value', async ({ page }) => {
  await signIn(page);
  let dialog = await openSheet(page);
  const first = dialog.getByRole('group', { name: 'קטגוריות' }).getByRole('button').first();
  const name = (await first.innerText()).trim();
  await press(first);
  await done(page);
  await expect(list(page).locator('[data-color]')).toHaveCount(1);

  dialog = await openSheet(page);
  await dialog.getByLabel('נוצר — מתאריך').fill('2025-10-01');
  await dialog.getByLabel('נוצר — עד תאריך').fill('2025-10-31');
  await done(page);
  await expect(list(page)).toContainText('נוצר: 1.10–31.10');
  await expect(removers(page)).toHaveCount(2);

  await page.getByRole('button', { name: `הסר סינון: ${name}` }).click();
  await expect(removers(page)).toHaveCount(1);
  await expect(list(page)).toContainText('נוצר: 1.10–31.10');
  await removers(page).first().click();
  await expect(list(page)).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });
    test('six values: capped to 2 + "+4" below lg, all shown on desktop, clear all', async ({
      page,
    }) => {
      await signIn(page);
      const dialog = await openSheet(page);
      await press(dialog.getByRole('group', { name: 'קטגוריות' }).getByRole('button').first());
      await press(dialog.getByRole('group', { name: 'סטטוס' }).getByRole('button').nth(0));
      await press(dialog.getByRole('group', { name: 'סטטוס' }).getByRole('button').nth(1));
      await press(dialog.getByRole('group', { name: 'חשיבות' }).getByRole('button').nth(0));
      await press(dialog.getByRole('group', { name: 'דחיפות' }).getByRole('button').nth(0));
      await dialog.getByLabel('נוצר — מתאריך').fill('2025-10-01');
      await done(page);

      const wide = (page.viewportSize()?.width ?? 0) >= 1024;
      if (wide) {
        await expect(removers(page)).toHaveCount(6);
        await expect(page.getByRole('button', { name: '+4' })).toHaveCount(0);
      } else {
        await expect(removers(page)).toHaveCount(2);
        await page.getByRole('button', { name: '+4' }).click();
        await expect(removers(page)).toHaveCount(6);
      }
      await page.getByRole('button', { name: 'נקה הכל' }).click();
      await expect(list(page)).toHaveCount(0);
    });
  });
}
