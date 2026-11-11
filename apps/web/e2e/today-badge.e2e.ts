import { expect, test, type Page } from '@playwright/test';
import { composeNote, openWorkspaces, signIn, unique } from './helpers';

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};

async function seed(page: Page, body: string, dueDate: string) {
  await composeNote(page, body);
  await page.getByLabel('תאריך יעד').fill(dueDate);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
}

for (const [label, viewport] of [
  ['phone', { width: 360, height: 800 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`Today item shows the due count, drops on done and follows the workspace (${label})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    const ws = unique('badge');
    await openWorkspaces(page);
    const dialog = page.getByRole('dialog', { name: 'מרחבי עבודה' });
    await dialog.getByRole('textbox', { name: 'שם מרחב חדש' }).fill(ws);
    await dialog.getByRole('button', { name: 'הוספה' }).click();
    await dialog.getByRole('radio', { name: ws }).click();
    await expect(page.getByRole('heading', { name: ws, exact: true })).toBeVisible();

    const today = page.getByRole('button', { name: /^היום/ });
    await expect(today).toHaveAccessibleName('היום');

    const late = unique('late');
    await seed(page, late, day(-1));
    await seed(page, unique('now'), day(0));
    await seed(page, unique('later'), day(5));
    await expect(today).toHaveAccessibleName('היום, 2 משימות');
    await expect(today).toContainText('2');

    const card = page.locator('ul.gap-3 > li', { hasText: late });
    for (
      let i = 0;
      i < 3 && (await card.locator('.pill-dot', { hasText: 'הושלם' }).count()) === 0;
      i++
    ) {
      await card
        .getByRole('button', { name: /לביצוע|בתהליך/ })
        .first()
        .click();
    }
    await expect(today).toHaveAccessibleName('היום, משימה אחת');

    await openWorkspaces(page);
    const other = page.getByRole('dialog', { name: 'מרחבי עבודה' }).getByRole('radio').first();
    await other.click();
    await expect(page.getByRole('dialog', { name: 'מרחבי עבודה' })).toBeHidden();
    await expect(page.getByRole('heading', { name: ws, exact: true })).toHaveCount(0);
    await expect(today).not.toHaveAccessibleName('היום, משימה אחת');

    // Delete the workspace so later specs still see a single one.
    await openWorkspaces(page);
    const wsDialog = page.getByRole('dialog', { name: 'מרחבי עבודה' });
    await wsDialog.getByRole('button', { name: `פעולות עבור ${ws}` }).click();
    await wsDialog.getByRole('button', { name: 'מחיקה' }).click();
    await wsDialog.getByRole('button', { name: 'מחיקה' }).click();
    await expect(wsDialog.getByRole('radio', { name: ws })).toHaveCount(0);
  });
}
