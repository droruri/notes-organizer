import { expect, test } from '@playwright/test';

test('dev sign-in opens the notes screen, loaded from the API', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
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

test('reloading offline with a stored session opens the app, not sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  // The page shell loads from the dev server; cut only the API, as offline does for /me.
  await page.route('**/me', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'כניסת פיתוח' })).toHaveCount(0);
});
