import { expect, test } from '@playwright/test';

test('the home page shows that the API is up', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByText('השרת פועל')).toBeVisible();
});

test('the language toggle switches to English LTR and survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('a share launch opens the add-note editor prefilled and clears the URL', async ({ page }) => {
  await page.goto('/?text=hello&url=https://example.com');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('hello\nhttps://example.com');
  expect(new URL(page.url()).search).toBe('');
});
