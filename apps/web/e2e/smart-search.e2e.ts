import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

const filter = {
  text: '',
  categoryIds: [],
  tagIds: [],
  statuses: ['done'],
  importances: [],
  urgencies: [],
  createdFrom: '',
  createdTo: '',
  dueFrom: '',
  dueTo: '',
  unreadLinksOnly: false,
};
const SENTENCE = 'משימות שהושלמו בשבוע האחרון';
const search = (page: Page) => page.getByRole('combobox', { name: 'חיפוש' });
const chips = (page: Page) => page.getByRole('list', { name: 'סינונים פעילים' });

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('sentence becomes chips, label, live status; removing a chip drops the label', async ({
      page,
    }) => {
      await page.route('**/notes/filter-from-text', async (route) => {
        await new Promise((r) => setTimeout(r, 800));
        await route.fulfill({ json: { filter }, headers: { 'access-control-allow-origin': '*' } });
      });
      await signIn(page);
      await expect(search(page)).toHaveAttribute('enterkeyhint', 'search');
      await search(page).fill(SENTENCE);
      await search(page).press('Enter');
      await expect(search(page)).toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('.spinner')).toBeVisible();
      await expect(page.getByText('הבנתי:')).toBeVisible();
      await expect(search(page)).toHaveAttribute('aria-busy', 'false');
      await expect(chips(page)).toBeVisible();
      await expect(search(page)).toBeFocused();
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: /^(נמצאו \d+ פתקים|נמצא פתק אחד|לא נמצאו פתקים)$/ }),
      ).toHaveCount(1);
      await chips(page)
        .getByRole('button', { name: /^הסר סינון/ })
        .first()
        .click();
      await expect(page.getByText('הבנתי:')).toHaveCount(0);
    });

    test('503 keeps the text and shows a notice', async ({ page }) => {
      await page.route('**/notes/filter-from-text', (route) =>
        route.fulfill({ status: 503, json: { error: 'unavailable' } }),
      );
      await signIn(page);
      await search(page).fill(SENTENCE);
      await search(page).press('Enter');
      await expect(page.getByText('החיפוש החכם לא זמין כרגע')).toBeVisible();
      await expect(search(page)).toHaveValue(SENTENCE);
      await expect(page.getByText('הבנתי:')).toHaveCount(0);
    });

    test('offline: no API call, notice shown', async ({ page, context }) => {
      let calls = 0;
      await page.route('**/notes/filter-from-text', (route) => {
        calls++;
        return route.fulfill({ json: { filter } });
      });
      await signIn(page);
      await context.setOffline(true);
      await search(page).fill(SENTENCE);
      await search(page).press('Enter');
      await expect(
        page.getByRole('status').filter({ hasText: 'חיפוש חכם דורש חיבור' }),
      ).toBeVisible();
      expect(calls).toBe(0);
    });
  });
}
