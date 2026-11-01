import { expect, type Page } from '@playwright/test';

/** Signs in as the seeded dev user (supabase/seed.sql) and waits for the notes list. */
export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
}

/** A body that is unique per run, so specs can share the dev user's database. */
export const unique = (label: string) =>
  `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Writes a text note and asks for a suggestion; leaves the page on the draft review. */
export async function composeNote(page: Page, body: string) {
  await page.getByRole('button', { name: 'פתק חדש' }).first().click();
  await page.getByRole('textbox', { name: 'טקסט' }).fill(body);
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue(body);
}

/** Texts of the note cards, in the order shown (NoteList's `ul.gap-3`, not the outbox's). */
export const cardTexts = (page: Page) => page.locator('ul.gap-3 > li').allInnerTexts();
