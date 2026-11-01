import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('a note saved without status has no pill; edit can turn tracking on', async ({ page }) => {
  await signIn(page);
  const body = unique('nostatus');
  await composeNote(page, body);
  const sw = page.getByRole('switch', { name: 'מעקב סטטוס' });
  await expect(sw).toBeVisible();
  await sw.uncheck();
  await page.screenshot({ path: '/tmp/e2e-shots/review-off.png' });
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();

  const card = page.locator('ul.gap-3 > li', { hasText: body });
  await expect(card).toBeVisible();
  await expect(card.locator('.pill-dot')).toHaveCount(0);
  expect(await card.getAttribute('class')).toContain('status-none');
  await page.screenshot({ path: '/tmp/e2e-shots/card-no-status.png' });

  await card.getByText(body).click();
  const sw2 = page.getByRole('switch', { name: 'מעקב סטטוס' });
  await expect(sw2).not.toBeChecked();
  await sw2.check();
  await page.screenshot({ path: '/tmp/e2e-shots/edit-on.png' });
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card2 = page.locator('ul.gap-3 > li', { hasText: body });
  await expect(card2.locator('.pill-dot', { hasText: 'לביצוע' })).toBeVisible();
  await page.screenshot({ path: '/tmp/e2e-shots/card-todo.png' });
});
