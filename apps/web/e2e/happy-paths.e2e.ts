import { expect, test } from '@playwright/test';
import { cardTexts, composeNote, signIn, unique } from './helpers';

const save = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'שמירה', exact: true }).click();

test('sign in → add a text note → review the draft → submit → appears in urgency order', async ({
  page,
}) => {
  await signIn(page);
  const calm = unique('calm');
  const hot = unique('hot');

  await composeNote(page, calm);
  await page.getByLabel('דחיפות').selectOption({ label: 'לא קריטי' });
  await save(page);
  await expect(page.getByText(calm)).toBeVisible();

  await composeNote(page, hot);
  await page.getByLabel('דחיפות').selectOption({ label: 'דחוף' });
  await save(page);
  await expect(page.getByText(hot)).toBeVisible();

  const texts = await cardTexts(page);
  const at = (needle: string) => texts.findIndex((t) => t.includes(needle));
  expect(at(hot)).toBeGreaterThanOrEqual(0);
  expect(at(hot)).toBeLessThan(at(calm));
});

test('filtering by a tag narrows the list', async ({ page }) => {
  await signIn(page);
  const tagged = unique('tagged');
  const other = unique('other');
  const category = unique('cat');
  const tag = unique('tag');

  await composeNote(page, tagged);
  await page.getByLabel('שם חדש').fill(category);
  await page.getByRole('button', { name: 'הוספה' }).click();
  await page.getByLabel('שם חדש').fill(tag);
  await page.getByLabel('הוסף אל').selectOption(category);
  await page.getByRole('button', { name: 'הוספה' }).click();
  await save(page);
  await expect(page.getByText(tagged)).toBeVisible();

  await composeNote(page, other);
  await save(page);
  await expect(page.getByText(other)).toBeVisible();

  await page.getByRole('button', { name: 'סינון' }).click();
  await page.getByRole('button', { name: tag, exact: true }).click();
  await expect(page.getByText(tagged)).toBeVisible();
  await expect(page.getByText(other)).toHaveCount(0);
});

test('a note written offline is sent from the dialog once back online', async ({
  page,
  context,
}) => {
  await signIn(page);
  const body = unique('offline');

  await context.setOffline(true);
  await page.getByRole('button', { name: 'פתק חדש' }).click();
  await page.getByRole('textbox', { name: 'טקסט' }).fill(body);
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר. יישלח כשהחיבור יחזור.')).toBeVisible();

  await context.setOffline(false);
  const dialog = page.getByRole('dialog', { name: 'פתקים שממתינים לשליחה' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: body }).click();
  await dialog.getByRole('button', { name: 'שמירה', exact: true }).click();

  // The queued note reaches the API and opens as a draft to review.
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue(body);
});

test('the chat answers "what categories do I have" from the fake script', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'שאלה', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'שאלות על הפתקים' });
  await chat.getByRole('textbox', { name: 'שאלו על הפתקים…' }).fill('אילו קטגוריות יש לי?');
  await chat.getByRole('button', { name: 'שליחה' }).click();
  await expect(chat.getByText('fake answer')).toBeVisible();
});
