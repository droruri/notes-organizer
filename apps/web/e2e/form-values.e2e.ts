import { expect, test } from '@playwright/test';
import { composeNote, signIn, unique } from './helpers';

test('a hidden urgency value is not offered on a new draft but stays on a note that has it', async ({
  page,
}) => {
  await signIn(page);
  const stored = unique('stored');
  const draft = unique('draft');
  const urgency = page.getByRole('combobox', { name: 'דחיפות', exact: true });
  const medium = 'בינוני';

  await composeNote(page, stored);
  await urgency.selectOption({ label: medium });
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card = page.locator('ul.gap-3 > li', { hasText: stored });
  await expect(card).toBeVisible();

  const setMedium = async (offered: boolean) => {
    await page.getByRole('button', { name: 'הגדרות טופס' }).click();
    const dialog = page.getByRole('dialog', { name: 'הגדרות טופס' });
    const chip = dialog.getByRole('button', { name: medium, exact: true });
    await expect(chip).toHaveAttribute('aria-pressed', String(!offered));
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', String(offered));
    await page.screenshot({ path: `/tmp/e2e-shots/settings-${offered ? 'on' : 'off'}.png` });
    await dialog.getByRole('button', { name: 'שמירת הגדרות' }).click();
    await expect(dialog).toHaveCount(0);
  };

  try {
    await composeNote(page, draft);
    await setMedium(false);
    await expect(urgency.locator('option', { hasText: medium })).toHaveCount(0);
    await expect(urgency.locator('option')).toHaveCount(4); // none + 3 others
    await page.getByRole('button', { name: 'ביטול', exact: true }).first().click();

    await card.getByText(stored).click();
    await expect(page.getByRole('heading', { name: 'עריכת פתק' })).toBeVisible();
    await expect(urgency).toHaveValue('medium');
    await expect(urgency.locator('option', { hasText: medium })).toHaveCount(1);
  } finally {
    await setMedium(true);
    await expect(urgency.locator('option', { hasText: medium })).toHaveCount(1);
  }
});
