import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('a note added offline from a cold start is queued, then sent on reconnect', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();

  // Cut the API (the dev server still serves the shell), then cold-start the screen.
  const cut = (route: import('@playwright/test').Route) => route.abort('internetdisconnected');
  await page.route(/\/(notes|taxonomy|settings)(\?|$)/, cut);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('אין חיבור');
  await page.getByRole('button', { name: 'פתק חדש' }).click();
  await page.getByRole('textbox').fill('offline e2e note');
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר')).toBeVisible();

  // Back online: reload with the API reachable; the outbox dialog offers the note.
  await page.unroute(/\/(notes|taxonomy|settings)(\?|$)/, cut);
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByText('offline e2e note').click();
  await page.getByRole('button', { name: 'שלח' }).click();
  // The dialog renders only while the outbox has entries, so it closing means the send worked.
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('offline e2e note').first()).toBeVisible();
});

test('saved notes show offline after a reload, with the waiting section', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  const count = await page
    .getByText(/^\d+ פתקים?$|פתקים/)
    .first()
    .textContent();
  // Let the persister flush to IndexedDB, then go offline and cold-start.
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  expect(
    await page
      .getByText(/^\d+ פתקים?$|פתקים/)
      .first()
      .textContent(),
  ).toBe(count);

  await page.getByRole('button', { name: 'פתק חדש' }).click();
  await page.getByRole('textbox').fill('waiting e2e note');
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר')).toBeVisible();
  await page.getByRole('button', { name: 'ביטול' }).click();
  await expect(page.getByText('ממתינים לשליחה (1)')).toBeVisible();
  await expect(page.getByText('waiting e2e note')).toBeVisible();

  // Back online: the list refetches.
  await context.setOffline(false);
  await expect(page.getByText('ממתינים לשליחה (1)')).toBeHidden();
});
