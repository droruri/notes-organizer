import { expect, test, type Page } from '@playwright/test';
import { signIn, unique } from './helpers';

const shot = (p: Page, n: string) => p.screenshot({ path: `/tmp/e2e-shots/${n}.png` });
const openWs = async (page: Page) => {
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'מרחבי עבודה' }).click();
  return page.getByRole('dialog', { name: 'מרחבי עבודה' });
};

for (const [w, h, scheme] of [
  [390, 844, 'light'],
  [1280, 800, 'dark'],
] as const) {
  test(`default filter ${w} ${scheme}`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      colorScheme: scheme,
    });
    const page = await ctx.newPage();
    await signIn(page);
    const ws = unique('B');
    let d = await openWs(page);
    await d.getByRole('textbox', { name: 'שם מרחב חדש' }).fill(ws);
    await d.getByRole('button', { name: 'הוספה' }).click();
    await d.getByRole('radio', { name: ws }).click();
    await expect(page.getByRole('heading', { name: ws, exact: true })).toBeVisible();
    d = await openWs(page);
    await d.getByRole('radio', { name: /ברירת מחדל/ }).click();
    await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'סינון' }).click();
    const sheet = page.getByRole('dialog').last();
    await sheet.getByRole('button', { name: 'לביצוע', exact: true }).click();
    const save = page.getByRole('button', { name: 'שמור כברירת מחדל' });
    await expect(save).toBeEnabled();
    await shot(page, `${w}-${scheme}-1-before-save`);
    await save.click();
    const saved = page.getByRole('button', { name: '✓ ברירת מחדל' });
    await expect(saved).toBeVisible();
    await expect(saved).toBeDisabled();
    await shot(page, `${w}-${scheme}-2-saved`);
    await page.keyboard.press('Escape');

    d = await openWs(page);
    await d.getByRole('radio', { name: ws }).click();
    await expect(page.getByRole('heading', { name: ws, exact: true })).toBeVisible();
    d = await openWs(page);
    await d.getByRole('radio', { name: /ברירת מחדל/ }).click();
    await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
    await ctx.close();

    const ctx2 = await browser.newContext({
      viewport: { width: w, height: h },
      colorScheme: scheme,
    });
    const p2 = await ctx2.newPage();
    await signIn(p2);
    await p2.getByRole('button', { name: 'סינון' }).click();
    const s2 = p2.getByRole('dialog').last();
    await expect(s2.getByRole('button', { name: 'לביצוע', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(p2.getByRole('button', { name: '✓ ברירת מחדל' })).toBeDisabled();
    await shot(p2, `${w}-${scheme}-3-fresh-context`);

    // cleanup: clear filter, save as default, delete B
    await s2.getByRole('button', { name: 'לביצוע', exact: true }).click();
    await p2.getByRole('button', { name: 'שמור כברירת מחדל' }).click();
    await expect(p2.getByRole('button', { name: '✓ ברירת מחדל' })).toBeVisible();
    await p2.keyboard.press('Escape');
    d = await openWs(p2);
    await d.getByRole('button', { name: `פעולות עבור ${ws}` }).click();
    await d.getByRole('button', { name: 'מחיקה' }).click();
    await ctx2.close();
  });
}
