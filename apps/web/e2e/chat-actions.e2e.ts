import { expect, test, type Page } from '@playwright/test';
import { signIn, unique } from './helpers';

/** Replaces the model with a scripted SSE answer: one `data-actions` part with the given actions. */
async function scriptChat(page: Page, names: string[]) {
  const part = {
    type: 'data-actions',
    data: names.map((name) => ({ action: 'create', kind: 'category', name })),
  };
  await page.route(/\/chat$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `data: ${JSON.stringify({ type: 'text-delta', delta: 'הנה ההצעות' })}\n\ndata: ${JSON.stringify(part)}\n\n`,
    });
  });
}

test('"approve all" applies the chat action cards in one request', async ({ page }) => {
  const names = [unique('קט א'), unique('קט ב'), unique('קט ג')];
  await signIn(page);
  await scriptChat(page, names);
  const applyPosts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/taxonomy/actions') {
      applyPosts.push(req.postData() ?? '');
    }
  });

  await page.getByRole('button', { name: 'שאלה', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'שאלות על הפתקים' });
  await chat.getByRole('textbox', { name: 'שאלו על הפתקים…' }).fill('צור קטגוריות');
  await chat.getByRole('button', { name: 'שליחה' }).click();

  await chat.getByRole('button', { name: 'לאשר הכול (3)' }).click();
  await expect(chat.getByText('בוצע', { exact: true })).toHaveCount(3);
  await expect(chat.getByRole('button', { name: /לאשר הכול/ })).toHaveCount(0);
  expect(applyPosts).toHaveLength(1);
  expect(JSON.parse(applyPosts[0] ?? '{}').actions).toHaveLength(3);

  await chat.getByRole('button', { name: 'סגירה' }).click();
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();
  for (const name of names) await expect(page.getByText(name, { exact: true })).toBeVisible();

  // Clean up: soft-delete the categories this run created.
  for (const name of names) {
    await page.getByRole('button', { name: `מחיקת ${name}` }).click();
  }
});

test('"approve all" recolors several categories from chat', async ({ page }) => {
  const names = [unique('צבע א'), unique('צבע ב')];
  await signIn(page);
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();
  const created: { id: string; name: string }[] = [];
  for (const name of names) {
    const res = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/categories' && r.request().method() === 'POST',
    );
    await page.getByLabel('קטגוריה חדשה').fill(name);
    await page.getByRole('button', { name: 'הוספת קטגוריה' }).click();
    created.push({ id: (await (await res).json()).id, name });
  }
  await page.getByRole('button', { name: 'חזרה' }).click();

  const part = {
    type: 'data-actions',
    data: created.map(({ id, name }) => ({
      action: 'recolor',
      kind: 'category',
      id,
      name,
      color: 'blue',
    })),
  };
  await page.route(/\/chat$/, (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: `data: ${JSON.stringify({ type: 'text-delta', delta: 'הנה ההצעות' })}\n\ndata: ${JSON.stringify(part)}\n\n`,
    });
  });

  await page.getByRole('button', { name: 'שאלה', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'שאלות על הפתקים' });
  await chat.getByRole('textbox', { name: 'שאלו על הפתקים…' }).fill('צבע כחול');
  await chat.getByRole('button', { name: 'שליחה' }).click();
  await expect(chat.locator('.cat-pill[data-color="blue"]')).toHaveCount(2);
  await chat.getByRole('button', { name: 'לאשר הכול (2)' }).click();
  await expect(chat.getByText('בוצע', { exact: true })).toHaveCount(2);

  await chat.getByRole('button', { name: 'סגירה' }).click();
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();
  for (const name of names) {
    await expect(
      page.getByRole('radiogroup', { name: `צבע של ${name}` }).getByRole('radio', { name: 'כחול' }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: `מחיקת ${name}` }).click();
  }
});
