import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

for (const [label, viewport] of [
  ['390', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`checklist: make, tick, progress survives reload (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    const head = unique('רשימה');
    await composeNote(page, `${head}\nחלב\nלהתקשר לדן\nלשלם חשבון`);
    await page.getByRole('button', { name: /הפיכה לרשימה/ }).click();
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    const card = page.locator('ul.gap-3 > li', { hasText: head });
    await card.getByRole('button', { name: 'הרחבה' }).click();
    await card.getByRole('checkbox', { name: 'חלב' }).click();
    await expect(card.getByRole('checkbox', { name: 'חלב' })).toBeChecked();
    await card.getByRole('checkbox', { name: 'להתקשר לדן' }).click();
    await expect(card.getByRole('checkbox', { name: 'להתקשר לדן' })).toBeChecked();
    await expect(card.getByText('2/4')).toBeVisible();
    await page.reload();
    await expect(page.locator('ul.gap-3 > li', { hasText: head }).getByText('2/4')).toBeVisible();
  });
}
