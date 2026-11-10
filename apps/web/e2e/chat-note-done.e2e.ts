import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

for (const [label, viewport] of [
  ['390', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`chat note card marks a note done (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    const body = unique('לסיים דוח');
    const drafted = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/notes' && r.request().method() === 'POST' && r.ok(),
    );
    await composeNote(page, body);
    const note = (await (await drafted).json()).note;
    await page.getByRole('button', { name: 'שמירה', exact: true }).click();
    const card = page.locator('ul.gap-3 > li', { hasText: body });
    await expect(card.locator('.pill-dot', { hasText: 'לביצוע' })).toBeVisible();

    const part = {
      type: 'data-actions',
      data: [
        {
          action: 'update',
          kind: 'note',
          id: note.id,
          name: body,
          edit: { status: 'done' },
          labels: { categories: [], tags: [] },
        },
      ],
    };
    await page.route(/\/chat$/, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: `data: ${JSON.stringify({ type: 'text-delta', delta: 'הנה ההצעה' })}\n\ndata: ${JSON.stringify(part)}\n\n`,
      });
    });

    await page
      .locator('[data-slot="list"]')
      .getByRole('button', { name: 'שאלה', exact: true })
      .click();
    const chat = page.getByRole('dialog', { name: 'שאלות על הפתקים' });
    await chat.getByRole('textbox', { name: 'שאלו על הפתקים…' }).fill('סמן כהושלם');
    await chat.getByRole('button', { name: 'שליחה' }).click();
    await expect(chat.getByText(`לעדכן את «${body}»`)).toBeVisible();
    await page.waitForTimeout(600); // let the enter animation finish
    await page.screenshot({ path: `/tmp/e2e-shots/card-${label}.png` });

    await chat.getByRole('button', { name: 'אישור', exact: true }).click();
    await expect(chat.getByText('בוצע', { exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/e2e-shots/applied-${label}.png` });

    await chat.getByRole('button', { name: viewport.width < 1024 ? 'חזרה' : 'סגירה' }).click();
    if (viewport.width >= 1024) await expect(chat).toBeHidden();
    const done = page.locator('ul.gap-3 > li', { hasText: body });
    await expect(done.locator('.pill-dot', { hasText: 'הושלם' })).toBeVisible();
    await page.screenshot({ path: `/tmp/e2e-shots/list-${label}.png` });

    // Clean up: delete the note through the UI.
    await done.getByText(body).click();
    await page.getByRole('button', { name: 'עריכה', exact: true }).click();
    await page.getByRole('button', { name: 'מחיקה', exact: true }).click();
    const confirm = page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'מחיקה', exact: true });
    if (await confirm.isVisible()) await confirm.click();
    await expect(page.locator('ul.gap-3 > li', { hasText: body })).toHaveCount(0);
  });
}
