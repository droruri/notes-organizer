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

test('a note changed on the server is highlighted after the sync, others are not', async ({
  page,
  browser,
}) => {
  await signIn(page);
  const body = unique('fresh');
  await composeNote(page, body);
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && /\/notes\/[0-9a-f-]+$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const id = new URL((await saved).url()).pathname.split('/').pop() ?? '';
  expect(id).toMatch(/^[0-9a-f-]+$/);
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
  const stable = unique('stable');
  await composeNote(page, stable);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page.locator('ul.gap-3 > li', { hasText: stable })).toBeVisible();
  await page.waitForTimeout(1500);

  const title = unique('edited');
  // A second session edits that note (a title replaces the body on the card), so its updatedAt differs from the cached one.
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const otherPage = await other.newPage();
  await signIn(otherPage);
  await otherPage.goto(`/notes/${id}/edit`);
  await otherPage.getByRole('textbox', { name: 'כותרת' }).fill(title);
  const patched = otherPage.waitForResponse((r) => r.request().method() === 'PATCH');
  await otherPage.getByRole('button', { name: 'שמירה', exact: true }).click();
  await patched;
  await other.close();

  await page.route('**/notes/changes*', async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.continue().catch(() => undefined);
  });
  await page.reload();
  const card = page.locator('ul.gap-3 > li', { hasText: title });
  await expect(card).toHaveClass(/note-fresh/, { timeout: 8000 });
  await expect(page.locator('ul.gap-3 > li', { hasText: stable })).not.toHaveClass(/note-fresh/);
  await expect(card).not.toHaveClass(/note-fresh/, { timeout: 4000 });
});
