import { expect, test, type Page } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

const doneRow = (page: Page) => page.getByRole('button', { name: /^הושלם \(\d+\)$/ });
const count = async (page: Page) =>
  Number(((await doneRow(page).innerText()).match(/\((\d+)\)/) ?? [])[1]);

async function addNote(page: Page, body: string) {
  await composeNote(page, body);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
}

for (const [label, viewport] of [
  ['360', { width: 360, height: 800 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`done notes fold into one closed row (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    const open = unique('פתוח');
    const body = unique('לסגור');
    await addNote(page, open);
    await addNote(page, body);

    const before = (await doneRow(page).count()) === 0 ? 0 : await count(page);
    const card = page.locator('ul.gap-3 > li', { hasText: body });
    await card.getByRole('button', { name: 'סמן כהושלם' }).click();
    await expect(page.locator('ul.gap-3 > li', { hasText: body })).toHaveCount(0);
    await expect.poll(() => count(page)).toBe(before + 1);
    await page.screenshot({ path: `/tmp/e2e-shots/folded-${label}.png` });

    await doneRow(page).click();
    await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
    await page.screenshot({ path: `/tmp/e2e-shots/open-${label}.png` });

    // Search text: flat, no fold row.
    await page.getByRole('combobox', { name: 'חיפוש בפתקים' }).fill(body);
    await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
    await expect(doneRow(page)).toHaveCount(0);
    await page.screenshot({ path: `/tmp/e2e-shots/search-${label}.png` });
  });
}
