import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('a slow background sync shows the pill, then the updated text', async ({ page }) => {
  await signIn(page);
  // Let the persister flush the notes to IndexedDB before reloading.
  await page.waitForTimeout(1500);
  await page.route('**/notes/changes*', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue().catch(() => undefined);
  });
  await page.reload();
  await expect(page.getByText('מתעדכן…')).toBeVisible();
  await expect(page.getByText(/^(הכל מעודכן|עודכן · )/)).toBeVisible({ timeout: 6000 });
});

test('one note changed on the server reads "עודכן · …"', async ({ page, browser }) => {
  await signIn(page);
  await page.waitForTimeout(1500);

  // A second session (own storage) adds a note after the first one's cache was saved.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const otherPage = await other.newPage();
  await signIn(otherPage);
  const body = unique('synced');
  await composeNote(otherPage, body);
  await otherPage.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(otherPage.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
  await other.close();

  await page.route('**/notes/changes*', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => undefined);
  });
  await page.reload();
  // Specs share the dev user and run in parallel, so other notes may land too: the exact count
  // ("שינוי אחד") is covered by the SyncPill unit test.
  await expect(page.getByText(/^עודכן · (שינוי אחד|\d+ שינויים)$/)).toBeVisible({ timeout: 8000 });
});
