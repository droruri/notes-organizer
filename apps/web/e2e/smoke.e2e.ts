import { expect, test } from '@playwright/test';

test('the home page shows that the API is up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('השרת פועל')).toBeVisible();
});

test('the language toggle switches to English LTR and survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
