import { expect, test, type Page } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

const URL_ = 'https://lnkd.in/p/dZ2Xfdma';
const LONG = 'https://example.com/' + 'a-very-long-path-segment/'.repeat(8) + 'end';

async function makeNote(page: Page, body: string, title?: string) {
  await signIn(page);
  await composeNote(page, body);
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && /\/notes\/[0-9a-f-]+$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  // The id comes from the PATCH URL, not from an unparsed response body.
  const id = new URL((await saved).url()).pathname.split('/').pop() ?? '';
  expect(id).toMatch(/^[0-9a-f-]+$/);
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toBeHidden();
  if (title) {
    await page.goto(`/notes/${id}/edit`);
    await page.getByRole('textbox', { name: 'כותרת' }).fill(title);
    const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    await patched;
    await expect(page.getByRole('textbox', { name: 'טקסט' })).toBeHidden();
  }
  await page.goto(`/notes/${id}`);
}

for (const [name, viewport] of [
  ['phone', { width: 360, height: 800 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${name} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme });
      test('link in note body', async ({ page }) => {
        const tag = unique('קישור');
        await makeNote(page, `${tag} ראה ${URL_}. ועוד ${LONG}`);
        const link = page.getByRole('link', { name: URL_ });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', URL_);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveCSS('text-decoration-line', 'underline');
        await expect(page.getByRole('link', { name: LONG })).toBeVisible();
        const noScroll = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        );
        expect(noScroll).toBe(true);
        await link.focus();
        await expect(link).toBeFocused();
        await page.screenshot({
          path: `/tmp/e2e-shots/view-${name}-${colorScheme}.png`,
          fullPage: true,
        });
      });
    });
  }
}

test.describe('expanded card', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('link shown in expanded list card', async ({ page }) => {
    const tag = unique('כרטיס');
    await makeNote(page, `ראה ${URL_}.`, tag);
    await page.goto('/');
    const card = page.locator('ul.gap-3 > li', { hasText: tag });
    await card.getByRole('button', { name: 'הרחבה' }).first().click();
    const link = card.getByRole('link', { name: URL_ });
    await expect(link).toHaveAttribute('target', '_blank');
    await page.screenshot({ path: '/tmp/e2e-shots/card-expanded.png', fullPage: true });
  });
});
