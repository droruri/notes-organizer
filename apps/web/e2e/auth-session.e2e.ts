import { expect, test } from '@playwright/test';
import { openMenu } from './helpers';

test('dev sign-in survives a reload, and sign-out returns to sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  const heading = page.getByRole('heading', { name: 'כללי', exact: true });
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(heading).toBeVisible();
  await expect(page.getByRole('button', { name: 'כניסת פיתוח' })).toHaveCount(0);
  await openMenu(page);
  await page.getByRole('menuitem', { name: 'התנתקות' }).click();
  await expect(page.getByRole('button', { name: 'כניסת פיתוח' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'כניסת פיתוח' })).toBeVisible();
});
