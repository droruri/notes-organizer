import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('empty compose fields are RTL, typed Latin text switches them to auto', async ({ page }) => {
  await signIn(page);
  await page.goto('/new');
  const body = page.getByRole('textbox', { name: 'טקסט' });
  const title = page.getByRole('textbox', { name: 'כותרת' });
  await expect(body).toHaveAttribute('dir', 'rtl');
  await expect(title).toHaveAttribute('dir', 'rtl');
  await body.fill('hello world');
  await title.fill('Hello');
  await expect(body).toHaveAttribute('dir', 'auto');
  await expect(title).toHaveAttribute('dir', 'auto');
  await body.fill('   ');
  await title.fill('  ');
  await expect(body).toHaveAttribute('dir', 'rtl');
  await expect(title).toHaveAttribute('dir', 'rtl');
});
