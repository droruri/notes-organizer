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
  await expect(page.getByText('offline e2e note').first()).toBeVisible();
});
