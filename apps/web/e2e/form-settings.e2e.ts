import { expect, test } from '@playwright/test';
import { composeNote, openFormSettings, signIn, unique } from './helpers';

// Both tests change the dev user's one form-settings record, so they must not run in parallel.
test.describe.configure({ mode: 'serial' });

test('hiding the due date applies to the open form, the other form and survives reload', async ({
  page,
}) => {
  await signIn(page);
  const stored = unique('stored');
  const draft = unique('draft');
  const dueDate = page.getByLabel('תאריך יעד', { exact: true });

  await composeNote(page, stored);
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  const card = page.locator('ul.gap-3 > li', { hasText: stored });
  await expect(card).toBeVisible();

  await composeNote(page, draft);
  await expect(dueDate).toBeVisible();
  await page.getByRole('textbox', { name: 'טקסט' }).fill(`${draft} extra`);
  const dialog = await openFormSettings(page);
  await expect(dialog.getByText('תמיד מוצג')).toBeVisible();
  await expect(dialog.getByRole('switch')).toHaveCount(9); // 5 fields + in-progress status + 3 quick actions
  await dialog.getByRole('switch', { name: 'הצגת תאריך יעד' }).uncheck();
  await dialog.getByRole('button', { name: 'שמירת הגדרות' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dueDate).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'טקסט' })).toHaveValue(`${draft} extra`);

  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await card.getByText(stored).click();
  await expect(page.getByRole('heading', { name: 'עריכת פתק' })).toBeVisible();
  await expect(dueDate).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'עריכת פתק' })).toBeVisible();
  await expect(dueDate).toHaveCount(0);

  // restore the setting
  const restore = await openFormSettings(page);
  await restore.getByRole('switch', { name: 'הצגת תאריך יעד' }).check();
  await restore.getByRole('button', { name: 'שמירת הגדרות' }).click();
  await expect(dueDate).toBeVisible();
});

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
    const dialog = await openFormSettings(page);
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
