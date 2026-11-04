import { expect, test } from '@playwright/test';
import { openMenu, signIn, unique } from './helpers';
import type { Page } from '@playwright/test';

/** Back to the notes list: the back button on phones, the sidebar's notes item on desktop. */
async function toNotes(page: Page) {
  const back = page.getByRole('button', { name: 'חזרה' });
  if (await back.isVisible()) await back.click();
  else await page.getByRole('button', { name: 'הפתקים', exact: true }).click();
}

test('pinning a category persists and puts it first in the notes category strip', async ({
  page,
}) => {
  await signIn(page);
  const name = unique('pin');
  await openMenu(page);
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();
  await page.getByLabel('קטגוריה חדשה').fill(name);
  await page.getByRole('button', { name: 'הוספת קטגוריה' }).click();

  await toNotes(page);
  const strip = page.getByRole('list', { name: 'קטגוריות' });
  const labels = () =>
    strip.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await expect(strip.getByRole('button').first()).toBeVisible();
  const before = await labels();
  await openMenu(page);
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();

  const pin = page.getByRole('button', { name: `נעיצת ${name}` });
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  const box = await pin.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  await pin.click();
  const unpin = page.getByRole('button', { name: `ביטול נעיצה של ${name}` });
  await expect(unpin).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: `ביטול נעיצה של ${name}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await toNotes(page);
  await expect(strip.getByRole('button').first()).toHaveAccessibleName(new RegExp(`^${name} `));

  await openMenu(page);
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();
  await page.getByRole('button', { name: `ביטול נעיצה של ${name}` }).click();
  await expect(page.getByRole('button', { name: `נעיצת ${name}` })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await toNotes(page);
  await expect.poll(labels).toEqual(before);

  await openMenu(page);
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();
  await page.getByRole('button', { name: `מחיקת ${name}` }).click();
});
