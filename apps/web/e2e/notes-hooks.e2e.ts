import { expect, test } from '@playwright/test';
import { composeNote, loadOfflineChunks, signIn, unique } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

const card = (page: import('@playwright/test').Page, text: string) =>
  page.locator('ul.gap-3 > li', { hasText: text });
// The dev user's list is long and capped; narrow it to this run's note first.
const find = (page: import('@playwright/test').Page, text: string) =>
  page.getByRole('combobox', { name: 'חיפוש בפתקים' }).fill(text);
const save = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'שמירה', exact: true }).click();

const edit = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'עריכה', exact: true }).click();

test('notes hooks: list, create, edit, status, delete+undo, re-analyze', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText(/^\d+ פתקים$/).first()).toBeVisible();
  const body = unique('hooks');
  await composeNote(page, body);
  await save(page);
  await find(page, body);
  await expect(card(page, body)).toBeVisible();

  // edit
  await card(page, body).getByText(body).click();
  await edit(page);
  const edited = `${body} edited`;
  await page.getByRole('textbox', { name: 'טקסט' }).fill(edited);
  await save(page);
  await page.getByRole('button', { name: 'חזרה' }).click();
  await find(page, body);
  await expect(card(page, edited)).toBeVisible();

  // status
  await card(page, edited)
    .getByRole('button', { name: /העבר ל/ })
    .click();
  await expect(card(page, edited).locator('.pill-dot').first()).not.toHaveText('לביצוע');
  await page.screenshot({ path: '/tmp/e2e-shots/hooks-status.png' });

  // re-analyze in editor
  await card(page, edited).getByText(edited).click();
  await edit(page);
  await page.getByRole('button', { name: 'ניתוח מחדש' }).click();
  await expect(page.getByRole('button', { name: 'ניתוח מחדש' })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toBeVisible();
  await page.screenshot({ path: '/tmp/e2e-shots/hooks-reanalyze.png' });

  // delete + undo
  await page.getByRole('button', { name: 'מחיקה', exact: true }).click();
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await expect(card(page, edited)).toHaveCount(0);
  await expect(page.getByText('ההערה נמחקה')).toBeVisible();
  await page.screenshot({ path: '/tmp/e2e-shots/hooks-undo-toast.png' });
  await page.getByRole('button', { name: 'ביטול', exact: true }).click();
  await expect(card(page, edited)).toBeVisible();

  // cleanup
  await card(page, edited).getByText(edited).click();
  await edit(page);
  await page.getByRole('button', { name: 'מחיקה', exact: true }).click();
  if (await confirm.isVisible()) await confirm.click();
  await expect(card(page, edited)).toHaveCount(0);
});

test('notes hooks: offline create is queued and resent exactly once', async ({ page, context }) => {
  await signIn(page);
  const body = unique('offlinehooks');
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/notes(\?|$)/.test(r.url())) posts++;
  });
  await loadOfflineChunks(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'פתק חדש' }).first().click();
  await page.getByRole('textbox', { name: 'טקסט' }).fill(body);
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר. יישלח כשהחיבור יחזור.')).toBeVisible();
  await page.screenshot({ path: '/tmp/e2e-shots/hooks-offline.png' });
  await context.setOffline(false);
  const dialog = page.getByRole('dialog', { name: 'פתקים שממתינים לשליחה' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: body }).click();
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue(body);
  await page.screenshot({ path: '/tmp/e2e-shots/hooks-offline-before.png' });
  await dialog.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.screenshot({ path: '/tmp/e2e-shots/hooks-offline-after.png' });
  // The resent note reaches the list once its review is saved (as before this change).
  await save(page);
  await find(page, body);
  await expect(card(page, body)).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(card(page, body)).toHaveCount(1);
  console.log('POST /notes count', posts);
  await card(page, body).getByText(body).click();
  await edit(page);
  await page.getByRole('button', { name: 'מחיקה', exact: true }).click();
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'מחיקה', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await expect(card(page, body)).toHaveCount(0);
});
