import { expect, test, type Page } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

async function makeAndOpenEditor(page: Page) {
  await signIn(page);
  const head = unique('עריכה');
  await composeNote(page, head);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card = page.locator('ul.gap-3 > li', { hasText: head });
  await card.getByRole('button', { name: head }).click();
  await page.getByRole('button', { name: 'עריכה', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+\/edit$/);
  await expect(page.getByRole('group', { name: 'רשימת משימות' })).toBeVisible();
  for (const text of ['חלב', 'לחם', 'ביצים']) {
    await page.getByRole('button', { name: 'הוספת פריט' }).click();
    await rows(page).last().fill(text);
  }
  return head;
}

const rows = (page: Page) => page.getByRole('textbox', { name: 'טקסט הפריט' });

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('checklist editor on touch', async ({ page }) => {
    await makeAndOpenEditor(page);
    const first = rows(page).first();
    const row = first.locator('xpath=..');
    expect((await row.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: 'מחיקת פריט' }).first()).toBeVisible();
    expect(
      await page
        .getByRole('button', { name: 'מחיקת פריט' })
        .first()
        .evaluate((e) => getComputedStyle(e).opacity),
    ).toBe('1');
    await page.getByRole('button', { name: 'הוספת פריט' }).click();
    await expect(rows(page)).toHaveCount(4);
    await rows(page).last().fill('דבש');
    await page.getByRole('checkbox', { name: 'בוצע' }).first().check();
    await first.fill('חלב 3%');
    await page.getByRole('button', { name: 'מחיקת פריט' }).nth(1).click();
    await expect(rows(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    // Save lands on the read-only view; Edit reopens the form.
    await page.getByRole('button', { name: 'עריכה', exact: true }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first()).toHaveValue('חלב 3%');
    await expect(rows(page).last()).toHaveValue('דבש');
    await expect(page.getByRole('checkbox', { name: 'בוצע' }).first()).toBeChecked();
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('checklist editor keyboard', async ({ page }) => {
    await makeAndOpenEditor(page);
    const row = rows(page).first().locator('xpath=..');
    const h = (await row.boundingBox())?.height ?? 0;
    expect(h).toBeGreaterThanOrEqual(34);
    expect(h).toBeLessThanOrEqual(44);
    const del = row.getByRole('button', { name: 'מחיקת פריט' });
    expect(await del.evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
    await row.hover();
    await expect.poll(() => del.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    await rows(page).first().focus();
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveCount(4);
    await expect(rows(page).nth(1)).toBeFocused();
    await expect(rows(page).nth(1)).toHaveValue('');
    await page.keyboard.press('Backspace');
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first()).toBeFocused();
    const box = page.getByRole('checkbox', { name: 'בוצע' }).first();
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await page.evaluate(() => {
      const el = document.activeElement;
      if (el instanceof HTMLElement) el.blur();
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'רשימת משימות' })).toBeHidden();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]+$/);
  });
});
