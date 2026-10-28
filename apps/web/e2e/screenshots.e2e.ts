import { test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

// Visual record for review: 390 px and desktop, light and dark. Attached to the report, not asserted.
const viewports = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

for (const [name, viewport] of Object.entries(viewports)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${name} ${colorScheme}`, () => {
      test.use({ viewport, colorScheme });

      test('list and draft review', async ({ page }, testInfo) => {
        await signIn(page);
        await page.screenshot({ path: testInfo.outputPath('list.png'), fullPage: true });
        await composeNote(page, unique('screenshot'));
        await page.screenshot({ path: testInfo.outputPath('draft.png'), fullPage: true });
        await testInfo.attach('list', { path: testInfo.outputPath('list.png') });
        await testInfo.attach('draft', { path: testInfo.outputPath('draft.png') });
      });
    });
  }
}
