import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const ALL = ['workspaces', 'record', 'import'] as const;

for (const width of [320, 375]) {
  test(`the quick-action bar fits a ${width}px viewport with all three extras`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.route(/\/settings$/, async (route) => {
      if (route.request().method() !== 'GET' || route.request().resourceType() === 'document')
        return route.fallback();
      const res = await route.fetch();
      const body = await res.json();
      await route.fulfill({ response: res, json: { ...body, quickActions: [...ALL] } });
    });
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const add = page.getByRole('button', { name: 'פתק חדש' }).first();
    await expect(add).toBeVisible();
    await expect(add).toHaveText('פתק חדש');
    await page.screenshot({ path: `/tmp/e2e-shots/quick-${width}.png` });
    for (const a of ALL) {
      const b = page.locator(`[data-quick-action="${a}"]`);
      await expect(b).toBeVisible();
      await expect(b).toHaveText('');
      const box = await b.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    }
    const box = await add.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  });
}
