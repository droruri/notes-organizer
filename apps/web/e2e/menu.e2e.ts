import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

const moreTab = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'תפריט' });

test('the More tab opens the menu sheet on the list, and signs out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
  await expect(moreTab(page)).toBeVisible();
  await moreTab(page).click();
  await expect(page.getByRole('menuitem', { name: 'התנתקות' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'התנתקות' }).click();
  await expect(page.getByRole('button', { name: 'כניסת פיתוח' })).toBeVisible();
});

test('the tab bar hides in a share-target compose launch', async ({ page }) => {
  await page.goto('/?text=hello');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue('hello');
  await expect(moreTab(page)).toBeHidden();
});

test('on desktop the sidebar shows the menu items without a tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(moreTab(page)).toBeHidden();
  await expect(page.getByRole('menuitem', { name: 'התנתקות' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'פתק חדש' }).first()).toBeVisible();
});

for (const dir of ['rtl', 'ltr'] as const) {
  test(`the menu sheet stays inside a 320px viewport (${dir})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    if (dir === 'ltr') await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('button', { name: dir === 'rtl' ? 'כניסת פיתוח' : 'Dev sign-in' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', dir);
    await page.getByRole('button', { name: dir === 'rtl' ? 'תפריט' : 'Menu' }).click();
    const box = await page.getByRole('menu').boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  });
}
