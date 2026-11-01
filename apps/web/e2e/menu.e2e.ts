import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

const menuButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'תפריט' });

test('the app menu is visible on the list and in compose, and signs out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
  await expect(menuButton(page)).toBeVisible();
  await menuButton(page).click();
  await expect(page.getByRole('menuitem', { name: 'התנתקות' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'התנתקות' }).click();
  await expect(page.getByRole('button', { name: 'כניסת פיתוח' })).toBeVisible();
});

test('the app menu is visible in a share-target compose launch', async ({ page }) => {
  await page.goto('/?text=hello');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue('hello');
  await expect(menuButton(page)).toBeVisible();
});

for (const dir of ['rtl', 'ltr'] as const) {
  test(`the menu popover stays inside a 320px viewport (${dir})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
    if (dir === 'ltr') await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await page.getByRole('button', { name: dir === 'rtl' ? 'תפריט' : 'Menu' }).click();
    const box = await page.getByRole('menu').boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });
}
