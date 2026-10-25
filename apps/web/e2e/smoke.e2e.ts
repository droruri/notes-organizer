import { expect, test } from '@playwright/test';

test('the home page shows that the API is up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('השרת פועל')).toBeVisible();
});
