import { expect, test, type Route } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

const savePosts = (route: Route) => route.request().method() === 'POST';

test('a save to a sleeping server is queued, then sent once when it answers', async ({ page }) => {
  test.setTimeout(90_000);
  const body = unique('slow save e2e');
  await signIn(page);

  // The server hangs: neither the save nor the health probe is answered.
  const held: Route[] = [];
  const hold = (route: Route) => {
    if (route.request().method() === 'POST' || route.request().url().endsWith('/health')) {
      held.push(route);
    } else void route.fallback();
  };
  await page.route('**/notes', (r) => (savePosts(r) ? hold(r) : r.fallback()));
  await page.route('**/health', hold);

  await page.getByRole('button', { name: 'פתק חדש' }).first().click();
  await page.getByRole('textbox', { name: 'טקסט' }).fill(body);
  await page.getByRole('button', { name: 'הצע סיווג' }).click();
  await expect(page.getByText('נשמר במכשיר')).toBeVisible({ timeout: 12_000 });
  const outbox = await page.evaluate(
    () => JSON.parse(localStorage.getItem('notes-outbox-v1') ?? '[]').length,
  );
  expect(outbox).toBe(1);

  // Release the routes: the outbox dialog offers the note; sending creates exactly one draft.
  await page.unroute('**/notes');
  await page.unroute('**/health');
  await Promise.all(held.map((r) => r.abort().catch(() => undefined)));
  let creates = 0;
  await page.route('**/notes', (r) => {
    if (savePosts(r)) creates += 1;
    return r.fallback();
  });
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByText(body).click();
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(creates).toBe(1);
});

test('an AI that is only slow is not queued while health answers', async ({ page }) => {
  test.setTimeout(90_000);
  const body = unique('slow ai e2e');
  await signIn(page);
  await page.route('**/notes', async (r) => {
    if (!savePosts(r)) return r.fallback();
    await new Promise((res) => setTimeout(res, 12_000));
    return r.fallback();
  });
  await composeNote(page, body);
  await expect(page.getByText('נשמר במכשיר')).toBeHidden();
});
