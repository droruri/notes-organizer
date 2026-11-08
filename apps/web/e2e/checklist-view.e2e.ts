import { expect, test, type Page } from '@playwright/test';
import { signIn, composeNote, unique } from './helpers';

const rows = (page: Page) => page.getByRole('textbox', { name: 'טקסט הפריט' });

async function makeChecklistView(page: Page) {
  await signIn(page);
  const head = unique('צפייה');
  await composeNote(page, head);
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && /\/notes\/[0-9a-f-]+$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const note: { id?: string } = await (await saved).json();
  expect(note.id).toBeTruthy();
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toBeHidden();
  await page.goto(`/notes/${note.id}/edit`);
  for (const text of ['חלב', 'לחם', 'ביצים']) {
    await page.getByRole('button', { name: 'הוספת פריט' }).click();
    await rows(page).last().fill(text);
  }
  await page.getByRole('checkbox', { name: 'בוצע' }).first().check();
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await patched;
  await expect(rows(page)).toHaveCount(0);
  await page.goto(`/notes/${note.id}`);
  await expect(page.getByRole('checkbox', { name: 'לחם' })).toBeVisible();
}

const rowH = async (page: Page, name: string) =>
  (await page.getByRole('checkbox', { name }).locator('xpath=ancestor::label').boundingBox())
    ?.height ?? 0;

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('view-mode checklist: 44px rows, tap saves, persists', async ({ page }) => {
    await makeChecklistView(page);
    expect(await rowH(page, 'לחם')).toBeGreaterThanOrEqual(44);
    await expect(page.getByText('1/3')).toBeVisible();
    await page.getByRole('checkbox', { name: 'לחם' }).tap();
    await expect(page.getByText('2/3')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'לחם' })).toBeChecked();
    await expect(page.getByText('2/3')).toBeVisible();
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test('view-mode checklist: mouse and Space, ~36px rows', async ({ page }) => {
    await makeChecklistView(page);
    const h = await rowH(page, 'לחם');
    expect(h).toBeGreaterThanOrEqual(35);
    expect(h).toBeLessThanOrEqual(38);
    await page.getByRole('checkbox', { name: 'לחם' }).click();
    await expect(page.getByText('2/3')).toBeVisible();
    await page.getByRole('checkbox', { name: 'ביצים' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: 'ביצים' })).toBeChecked();
    await expect(page.getByText('3/3')).toBeVisible();
    await page.reload();
    await expect(page.getByText('3/3')).toBeVisible();
  });
});
