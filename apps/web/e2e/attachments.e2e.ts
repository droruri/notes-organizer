import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

const PDF = Buffer.from(
  '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

test('attach a PDF in the draft → it is listed on the expanded card → tapping it downloads the same bytes', async ({
  page,
}) => {
  await signIn(page);
  const body = unique('attach');
  const name = `doc-${Date.now()}.pdf`;

  await composeNote(page, body);
  await page
    .getByTestId('attachment-input')
    .setInputFiles({ name, mimeType: 'application/pdf', buffer: PDF });
  const draftRow = page.getByRole('button', { name: `הורדת ${name}` });
  await expect(draftRow).toBeVisible();
  await expect(draftRow).toContainText('KB');

  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card = page.locator('ul.gap-3 > li', { hasText: body });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'הרחבה' }).click();

  const row = card.getByRole('button', { name: `הורדת ${name}` });
  await expect(row).toBeVisible();
  await expect(card.getByRole('button', { name: 'הוספת קובץ' })).toHaveCount(0);

  const [download] = await Promise.all([page.waitForEvent('download'), row.click()]);
  expect(download.suggestedFilename()).toBe(name);
  const path = await download.path();
  expect((await readFile(path)).equals(PDF)).toBe(true);
});

// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('attach a PNG → its thumbnail shows on the expanded card', async ({ page }) => {
  await signIn(page);
  const body = unique('thumb');
  const name = `pic-${Date.now()}.png`;

  await composeNote(page, body);
  await page
    .getByTestId('attachment-input')
    .setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('img', { name })).toBeVisible();

  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card = page.locator('ul.gap-3 > li', { hasText: body });
  await card.getByRole('button', { name: 'הרחבה' }).click();
  await expect(card.getByRole('img', { name })).toBeVisible();
});
