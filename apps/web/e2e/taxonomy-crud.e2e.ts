import { expect, test } from '@playwright/test';
import { openMenu, signIn, unique } from './helpers';

test('taxonomy screen: category and tag CRUD, color, pin, importance, restore', async ({
  page,
}) => {
  await signIn(page);
  await openMenu(page);
  await page.getByRole('menuitem', { name: 'קטגוריות ותגיות' }).click();

  const name = unique('קט');
  const renamed = `${name} חדש`;
  await page.getByLabel('קטגוריה חדשה').fill(name);
  await page.getByRole('button', { name: 'הוספת קטגוריה' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  await page.getByRole('button', { name: `שינוי שם של ${name}` }).click();
  await page.getByLabel(`שם חדש ל${name}`).fill(renamed);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible();

  await page
    .getByRole('radiogroup', { name: `צבע של ${renamed}` })
    .getByRole('radio', { name: 'ירוק' })
    .click();
  await expect(
    page.getByRole('radiogroup', { name: `צבע של ${renamed}` }).getByRole('radio', { name: 'ירוק' }),
  ).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: `נעיצת ${renamed}` }).click();
  await expect(page.getByRole('button', { name: `ביטול נעיצה של ${renamed}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: `ביטול נעיצה של ${renamed}` }).click();
  await expect(page.getByRole('button', { name: `נעיצת ${renamed}` })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  const imp = page.getByRole('radiogroup', { name: `חשיבות ברירת מחדל ל${renamed}` });
  await imp.getByRole('radio', { name: 'חשוב', exact: true }).click();
  await expect(imp.getByRole('radio', { name: 'חשוב', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // tags
  const tag = unique('תג');
  const tag2 = `${tag} ב`;
  await page.getByRole('button', { name: `הוספת תגית ל${renamed}` }).click();
  await page.getByLabel(`תגית חדשה ב${renamed}`).fill(tag);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('button', { name: tag, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `שינוי שם של ${tag}` }).click();
  await page.getByLabel(`שם חדש ל${tag}`).fill(tag2);
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('button', { name: tag2, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `מחיקת ${tag2}` }).click();
  await expect(page.getByRole('button', { name: `שחזור ${tag2}` })).toBeVisible();
  await page.getByRole('button', { name: `שחזור ${tag2}` }).click();
  await expect(page.getByRole('button', { name: tag2, exact: true })).toBeVisible();

  // delete + restore category
  await page.getByRole('button', { name: `מחיקת ${renamed}` }).click();
  await expect(page.getByRole('button', { name: `שחזור ${renamed}` })).toBeVisible();
  await page.getByRole('button', { name: `שחזור ${renamed}` }).click();
  await expect(page.getByRole('button', { name: `מחיקת ${renamed}` })).toBeVisible();
  await page.getByRole('button', { name: `מחיקת ${renamed}` }).click();
});
