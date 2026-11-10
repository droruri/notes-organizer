import { expect, test, type Page } from '@playwright/test';
import { composeNote, signIn, unique, openWorkspaces } from './helpers';

const widths = [375, 1280];

const openDialog = async (page: Page) => {
  await openWorkspaces(page);
  await expect(page.getByRole('dialog', { name: 'מרחבי עבודה' })).toBeVisible();
};

for (const width of widths) {
  test(`search across all workspaces @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page);
    const chip = page.getByRole('button', { name: 'בכל סביבות העבודה', exact: true });
    const initialChips = await chip.count();
    const ws = unique('אחר');
    const tag = unique('zq').replace(/[^a-z0-9]/gi, '');
    const bodyA = `${tag}alpha`;
    const bodyB = `${tag}beta`;

    await composeNote(page, bodyA);
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await expect(page.locator('ul.gap-3 > li', { hasText: bodyA })).toBeVisible();

    if (initialChips === 0) await expect(chip).toHaveCount(0);
    const dialog = page.getByRole('dialog', { name: 'מרחבי עבודה' });
    try {
      await openDialog(page);
      await dialog.getByRole('textbox', { name: 'שם מרחב חדש' }).fill(ws);
      await dialog.getByRole('button', { name: 'הוספה' }).click();
      await dialog.getByRole('radio', { name: ws }).click();
      await expect(page.getByRole('heading', { name: ws, exact: true })).toBeVisible();
      await composeNote(page, bodyB);
      await page.getByRole('button', { name: 'שמירה', exact: true }).click();
      await expect(page.locator('ul.gap-3 > li', { hasText: bodyB })).toBeVisible();

      await expect(chip).toBeVisible();
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
      const search = page.getByRole('searchbox').or(page.getByPlaceholder('חיפוש בפתקים')).first();
      await search.fill(tag);
      await expect(page.locator('ul.gap-3 > li', { hasText: bodyB })).toBeVisible();
      await expect(page.locator('ul.gap-3 > li', { hasText: bodyA })).toHaveCount(0);

      await chip.click();
      const cardA = page.locator('ul.gap-3 > li', { hasText: bodyA });
      await expect(cardA).toBeVisible();
      await expect(cardA).toContainText('כללי');
      await expect(page.locator('ul.gap-3 > li', { hasText: bodyB })).toBeVisible();

      await cardA.getByRole('button', { name: bodyA }).click();
      await page.getByRole('button', { name: 'עריכה', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue(bodyA);
      await page.goBack();
      await page.goBack();

      await search.fill(tag);
      await chip.click();
      await expect(page.locator('ul.gap-3 > li', { hasText: bodyA })).toHaveCount(0);
      await expect(page.locator('ul.gap-3 > li', { hasText: bodyB })).toBeVisible();
    } finally {
      // cleanup: delete the extra workspace
      await openDialog(page);
      await dialog.getByRole('button', { name: `פעולות עבור ${ws}` }).click();
      await dialog.getByRole('button', { name: 'מחיקה' }).click();
      await dialog.getByRole('button', { name: 'מחיקה' }).click();
      await expect(dialog.getByRole('radio', { name: ws })).toHaveCount(0);
    }
  });
}
