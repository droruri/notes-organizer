import type { CategoryColor } from '@notes/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiRequestError } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { TaxonomyScreen } from './TaxonomyScreen';

const C1 = '00000000-0000-4000-8000-000000000001';
const C2 = '00000000-0000-4000-8000-000000000002';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const T2 = '00000000-0000-4000-8000-0000000000a2';

beforeEach(async () => {
  await i18n.changeLanguage('he');
  document.documentElement.dir = 'rtl';
});
afterEach(cleanup);

const taxonomy = (color1: CategoryColor = 'slate') => ({
  categories: [
    {
      id: C1,
      name: 'עבודה',
      deleted: false,
      importance: null,
      color: color1,
      tags: [
        { id: T1, categoryId: C1, name: 'דחוף', deleted: false },
        { id: T2, categoryId: C1, name: 'ישן', deleted: true },
      ],
    },
    { id: C2, name: 'בית', deleted: true, importance: null, color: 'slate' as const, tags: [] },
  ],
});

function setup(overrides: Record<string, unknown> = {}) {
  const taxonomyApi = {
    taxonomy: vi.fn(async () => taxonomy()),
    createCategory: vi.fn(async () => ({
      id: C1,
      name: 'x',
      deleted: false,
      importance: null,
      color: 'slate' as const,
    })),
    renameCategory: vi.fn(async () => ({
      id: C1,
      name: 'x',
      deleted: false,
      importance: null,
      color: 'slate' as const,
    })),
    setCategoryColor: vi.fn(async () => ({
      id: C1,
      name: 'עבודה',
      deleted: false,
      importance: null,
      color: 'red' as const,
    })),
    setCategoryImportance: vi.fn(async () => ({
      id: C1,
      name: 'עבודה',
      deleted: false,
      importance: null,
      color: 'slate' as const,
    })),
    deleteCategory: vi.fn(async () => undefined),
    restoreCategory: vi.fn(async () => ({
      id: C2,
      name: 'בית',
      deleted: false,
      importance: null,
      color: 'slate' as const,
    })),
    createTag: vi.fn(async () => ({ id: T1, categoryId: C1, name: 'x', deleted: false })),
    renameTag: vi.fn(async () => ({ id: T1, categoryId: C1, name: 'x', deleted: false })),
    deleteTag: vi.fn(async () => undefined),
    restoreTag: vi.fn(async () => ({ id: T2, categoryId: C1, name: 'ישן', deleted: false })),
    ...overrides,
  };
  const onTag = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TaxonomyScreen onBack={() => undefined} onTag={onTag} taxonomyApi={taxonomyApi} />
    </QueryClientProvider>,
  );
  return { taxonomyApi, onTag };
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });

describe('TaxonomyScreen', () => {
  it('adds a category, then refreshes the list', async () => {
    const { taxonomyApi } = setup();
    await screen.findByText('עבודה');
    type('קטגוריה חדשה', 'כספים');
    fireEvent.click(screen.getByRole('button', { name: 'הוספת קטגוריה' }));
    await waitFor(() => expect(taxonomyApi.createCategory).toHaveBeenCalledWith('כספים'));
    await waitFor(() => expect(taxonomyApi.taxonomy).toHaveBeenCalledTimes(2));
  });

  it('adds a tag to a category', async () => {
    const { taxonomyApi } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'הוספת תגית לעבודה' }));
    type('תגית חדשה בעבודה', 'לקוח');
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    await waitFor(() => expect(taxonomyApi.createTag).toHaveBeenCalledWith(C1, 'לקוח'));
    await waitFor(() => expect(taxonomyApi.taxonomy).toHaveBeenCalledTimes(2));
  });

  it('renames a category and a tag', async () => {
    const { taxonomyApi } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'שינוי שם של עבודה' }));
    type('שם חדש לעבודה', 'משרד');
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    await waitFor(() => expect(taxonomyApi.renameCategory).toHaveBeenCalledWith(C1, 'משרד'));
    await waitFor(() => expect(taxonomyApi.taxonomy).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'שינוי שם של דחוף' }));
    type('שם חדש לדחוף', 'חשוב');
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    await waitFor(() => expect(taxonomyApi.renameTag).toHaveBeenCalledWith(T1, 'חשוב'));
  });

  it('deletes a category and a tag', async () => {
    const { taxonomyApi } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'מחיקת דחוף' }));
    await waitFor(() => expect(taxonomyApi.deleteTag).toHaveBeenCalledWith(T1));
    fireEvent.click(screen.getByRole('button', { name: 'מחיקת עבודה' }));
    await waitFor(() => expect(taxonomyApi.deleteCategory).toHaveBeenCalledWith(C1));
    await waitFor(() => expect(taxonomyApi.taxonomy).toHaveBeenCalledTimes(3));
  });

  it('restores deleted ones, shown muted', async () => {
    const { taxonomyApi } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'שחזור בית' }));
    await waitFor(() => expect(taxonomyApi.restoreCategory).toHaveBeenCalledWith(C2));
    fireEvent.click(screen.getByRole('button', { name: 'שחזור ישן' }));
    await waitFor(() => expect(taxonomyApi.restoreTag).toHaveBeenCalledWith(T2));
    await waitFor(() => expect(taxonomyApi.taxonomy).toHaveBeenCalledTimes(3));
  });

  it('shows the name-exists error on a 409 and does not refresh', async () => {
    const createCategory = vi.fn(async () => {
      throw new ApiRequestError(409, 'name_taken', 'conflict');
    });
    const { taxonomyApi } = setup({ createCategory });
    await screen.findByText('עבודה');
    type('קטגוריה חדשה', 'עבודה');
    fireEvent.click(screen.getByRole('button', { name: 'הוספת קטגוריה' }));
    expect((await screen.findByRole('alert')).textContent).toBe('השם כבר קיים.');
    expect(taxonomyApi.taxonomy).toHaveBeenCalledTimes(1);
  });

  it('shows the category-deleted error on a 422', async () => {
    const createTag = vi.fn(async () => {
      throw new ApiRequestError(422, 'category_deleted', 'unprocessable');
    });
    setup({ createTag });
    fireEvent.click(await screen.findByRole('button', { name: 'הוספת תגית לעבודה' }));
    type('תגית חדשה בעבודה', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }));
    expect((await screen.findByRole('alert')).textContent).toBe('הקטגוריה נמחקה.');
  });

  it('opens the notes list for a tapped tag', async () => {
    const { onTag } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'דחוף' }));
    expect(onTag).toHaveBeenCalledWith(T1);
  });

  it('saves a category color with one tap and shows the swatch as checked', async () => {
    const { taxonomyApi } = setup();
    await screen.findByText('עבודה');
    expect(screen.getByRole('radiogroup', { name: 'צבע של עבודה' })).toBeTruthy();
    expect(
      screen.getAllByRole('radio', { name: /^(כחול|ירוק|סגול|כתום|טורקיז|ורוד|אדום|אפור)$/ }),
    ).toHaveLength(8);
    expect(screen.getByRole('radio', { name: 'אפור' }).getAttribute('aria-checked')).toBe('true');
    taxonomyApi.taxonomy.mockResolvedValue(taxonomy('red'));
    fireEvent.click(screen.getByRole('radio', { name: 'אדום' }));
    await waitFor(() => expect(taxonomyApi.setCategoryColor).toHaveBeenCalledWith(C1, 'red'));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'אדום' }).getAttribute('aria-checked')).toBe('true'),
    );
  });

  it('sets, changes and clears a category importance with one tap', async () => {
    const { taxonomyApi } = setup();
    await screen.findByText('עבודה');
    const group = screen.getByRole('radiogroup', { name: 'חשיבות ברירת מחדל לעבודה' });
    expect(group).toBeTruthy();
    const none = screen.getByRole('radio', { name: 'ללא' });
    expect(none.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'חשוב' }));
    await waitFor(() =>
      expect(taxonomyApi.setCategoryImportance).toHaveBeenCalledWith(C1, 'important'),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'לא חשוב' }));
    await waitFor(() =>
      expect(taxonomyApi.setCategoryImportance).toHaveBeenCalledWith(C1, 'not_important'),
    );
  });

  it('clears the level by tapping none, and shows deleted categories a pill instead', async () => {
    const { taxonomyApi } = setup({
      taxonomy: vi.fn(async () => ({
        categories: [
          {
            id: C1,
            name: 'עבודה',
            deleted: false,
            importance: 'important',
            color: 'slate' as const,
            tags: [],
          },
          {
            id: C2,
            name: 'בית',
            deleted: true,
            importance: 'not_important',
            color: 'slate' as const,
            tags: [],
          },
        ],
      })),
    });
    await screen.findByText('עבודה');
    fireEvent.click(screen.getByRole('radio', { name: 'ללא' }));
    await waitFor(() => expect(taxonomyApi.setCategoryImportance).toHaveBeenCalledWith(C1, null));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.queryByRole('radiogroup', { name: 'צבע של בית' })).toBeNull();
    expect(screen.getByText('ברירת מחדל: לא חשוב')).toBeTruthy();
  });
});
