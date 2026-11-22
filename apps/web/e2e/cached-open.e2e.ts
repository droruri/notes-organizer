import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('a reload shows the saved notes while /me is still pending', async ({ page }) => {
  // Watch every document load for the loading text, so a flash before the notes is caught too.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.body?.textContent?.includes('מתחבר…')) {
        document.documentElement.dataset.sawLoading = 'true';
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
  // Let the persister flush the notes to IndexedDB before reloading.
  await page.waitForTimeout(1500);

  await page.route('**/me', async (route) => {
    await new Promise((r) => setTimeout(r, 30_000));
    await route.continue().catch(() => undefined);
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible({
    timeout: 1000,
  });
  await expect(page.getByText('מתחבר…')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-saw-loading', 'true');
});
