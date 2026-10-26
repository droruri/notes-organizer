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
  await page.getByRole('textbox', { name: 'טקסט' }).fill('offline e2e note');
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר')).toBeVisible();

  // Back online: reload with the API reachable; the outbox dialog offers the note.
  await page.unroute(/\/(notes|taxonomy|settings)(\?|$)/, cut);
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByText('offline e2e note').click();
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  // The dialog renders only while the outbox has entries, so it closing means the send worked.
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('offline e2e note').first()).toBeVisible();
});

test('saved notes show offline after a reload, with the waiting section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  const countText = page.getByText(/^\d+ פתקים$/).first();
  const count = await countText.textContent();
  // Let the persister flush to IndexedDB, then go offline and cold-start.
  await page.waitForTimeout(1500);
  // The dev server has no service worker to serve the shell offline, so cut everything but it.
  await page.route(
    (url) => url.origin !== new URL(page.url()).origin,
    (route) => route.abort('internetdisconnected'),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'הפתקים', exact: true })).toBeVisible();
  await expect(countText).toHaveText(count ?? '');

  await page.getByRole('button', { name: 'פתק חדש' }).click();
  await page.getByRole('textbox', { name: 'טקסט' }).fill('waiting e2e note');
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר')).toBeVisible();
  await expect(page.getByText('ממתינים לשליחה (1)')).toBeVisible();
  await expect(page.getByText('waiting e2e note')).toBeVisible();

  // Back online: the list refetches from the API and the waiting section goes away.
  await page.unrouteAll();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('ממתינים לשליחה (1)')).toBeHidden();
});
