import { expect, test } from '@playwright/test';
import { unique } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('a note added offline from a cold start is queued, then sent on reconnect', async ({
  page,
}) => {
  const body = unique('offline e2e note');
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();

  // Cut the API (the dev server still serves the shell), then cold-start the screen.
  const cut = (route: import('@playwright/test').Route) => route.abort('internetdisconnected');
  await page.route(/\/(notes\/changes|taxonomy|settings)(\?|$)/, cut);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'אין חיבור' })).toBeVisible();
  await page.getByRole('button', { name: 'פתק חדש' }).click();
  await page.getByRole('textbox', { name: 'טקסט' }).fill(body);
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר')).toBeVisible();

  // Back online: reload with the API reachable; the outbox dialog offers the note.
  await page.unroute(/\/(notes\/changes|taxonomy|settings)(\?|$)/, cut);
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByText(body).click();
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  // The dialog renders only while the outbox has entries, so it closing means the send worked.
  await expect(page.getByRole('dialog')).toBeHidden();
  // The sent note opens in its review; saving it lands on the list.
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page.locator('ul.gap-3 > li', { hasText: body })).toBeVisible();
});

test('saved notes show offline after a reload, with the waiting section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'כניסת פיתוח' }).click();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
  const countText = page.getByText(/^\d+ פתקים$/).first();
  const count = await countText.textContent();
  // Let the persister flush to IndexedDB, then go offline and cold-start.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('keyval-store');
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('keyval')) {
                db.close();
                resolve(false);
                return;
              }
              const get = db
                .transaction('keyval', 'readonly')
                .objectStore('keyval')
                .get('notes-query-cache-v1');
              get.onerror = () => {
                db.close();
                resolve(false);
              };
              get.onsuccess = () => {
                db.close();
                resolve(JSON.stringify(get.result ?? '').includes('"workspaces"'));
              };
            };
          }),
      ),
    )
    .toBe(true);
  // The dev server has no service worker to serve the shell offline, so cut everything but it.
  await page.route(
    (url) => url.origin !== new URL(page.url()).origin,
    (route) => route.abort('internetdisconnected'),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'כללי', exact: true })).toBeVisible();
  await expect(countText).toHaveText(count ?? '');

  await page.getByRole('button', { name: 'פתק חדש' }).click();
  await page.getByRole('textbox', { name: 'טקסט' }).fill('waiting e2e note');
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר')).toBeVisible();
  await expect(page.getByText('ממתינים לשליחה (1)')).toBeVisible();
  await expect(page.getByText('waiting e2e note')).toBeVisible();

  // Back online: the list refetches from the API and the waiting section goes away.
  const refetch = page.waitForRequest(/\/notes\/changes(\?|$)/);
  await page.unrouteAll();
  // The browser never went offline (only requests were cut), so react-query needs the full
  // offline -> online transition to refetch.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await refetch;
  await expect(page.getByText('ממתינים לשליחה (1)')).toBeHidden();
});
