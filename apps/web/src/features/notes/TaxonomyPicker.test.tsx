import type { Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { i18n } from '../../lib/i18n';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { pickedFrom } from './picked';
import { TaxonomyPicker, type Picked } from './TaxonomyPicker';

const C = '11111111-1111-4111-8111-111111111111';
const taxonomy: Taxonomy = {
  categories: [
    { id: C, name: 'עבודה', deleted: false, importance: null, color: 'slate' as const, tags: [] },
  ],
};
afterEach(cleanup);

describe('TaxonomyPicker', () => {
  it('badges Claude’s new names and keeps existing chips unbadged', () => {
    render(
      <TaxonomyPicker
        taxonomy={taxonomy}
        value={{ categoryIds: [], tagIds: [], newCategories: ['בית'], newTags: [] }}
        onChange={() => undefined}
      />,
    );
    const fresh = screen.getByRole('button', { name: /בית/ });
    const existing = screen.getByRole('button', { name: /עבודה/ });
    expect(fresh?.textContent).toContain('חדש');
    expect(existing?.textContent).not.toContain('חדש');
  });

  it('toggles an offered new category, unselected when an existing one is suggested', () => {
    const empty = {
      newTags: [],
      tagIds: [],
      dueDate: null,
      importance: null,
      color: 'slate' as const,
      urgency: null,
      title: null,
      unreadLinks: [],
    };
    const initial = pickedFrom({ ...empty, categoryIds: [C], newCategories: ['הופעות'] });
    expect(initial.newCategories).toEqual([]);
    expect(
      pickedFrom({ ...empty, categoryIds: [], newCategories: ['הופעות'] }).newCategories,
    ).toEqual(['הופעות']);
    const onChange = vi.fn();
    const { rerender } = render(
      <TaxonomyPicker taxonomy={taxonomy} value={initial} onChange={onChange} />,
    );
    const chip = screen.getByRole('button', { name: /הופעות/ });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ newCategories: ['הופעות'] }),
    );
    rerender(
      <TaxonomyPicker
        taxonomy={taxonomy}
        value={{ ...initial, newCategories: ['הופעות'] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: /הופעות/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /הופעות/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ newCategories: [] }));
  });

  it('creates a new category inline', () => {
    const onChange = vi.fn();
    render(
      <TaxonomyPicker
        taxonomy={taxonomy}
        value={{ categoryIds: [], tagIds: [], newCategories: [], newTags: [] }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('שם חדש'), { target: { value: ' קניות ' } });
    fireEvent.click(screen.getByText('הוספה'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ newCategories: ['קניות'] }));
  });

  it('groups tags under their category with a bare accessible name', () => {
    const T = '22222222-2222-4222-8222-222222222222';
    const tax: Taxonomy = {
      categories: [
        {
          id: C,
          name: 'עבודה',
          deleted: false,
          importance: null,
          color: 'slate' as const,
          tags: [{ id: T, categoryId: C, name: 'דחוף', deleted: false }],
        },
      ],
    };
    render(
      <TaxonomyPicker
        taxonomy={tax}
        value={{
          categoryIds: [],
          tagIds: [],
          newCategories: ['בית'],
          newTags: [{ categoryName: 'בית', name: 'כביסה' }],
        }}
        onChange={() => undefined}
      />,
    );
    const work = screen.getByRole('group', { name: 'עבודה' });
    expect(within(work).getByRole('button', { name: 'דחוף' })).toBeTruthy();
    const home = screen.getByRole('group', { name: 'בית' });
    expect(within(home).getByRole('button', { name: 'כביסה' })).toBeTruthy();
  });

  it('puts a new tag whose category was removed in an unlabeled final row', () => {
    const tax: Taxonomy = { categories: [] };
    render(
      <TaxonomyPicker
        taxonomy={tax}
        value={{
          categoryIds: [],
          tagIds: [],
          newCategories: [],
          newTags: [{ categoryName: 'נמחקה', name: 'יתום' }],
        }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'יתום' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'נמחקה' })).toBeNull();
  });

  it('hides the tags section when there are no tag rows', () => {
    render(
      <TaxonomyPicker
        taxonomy={{ categories: [] }}
        value={{ categoryIds: [], tagIds: [], newCategories: [], newTags: [] }}
        onChange={() => undefined}
      />,
    );
    expect(screen.queryByRole('group', { name: 'תגיות' })).toBeNull();
  });

  it('lists categories, tags and new names alphabetically', () => {
    const tag = (id: string, name: string) => ({ id, categoryId: C, name, deleted: false });
    const sorted: Taxonomy = {
      categories: ['תל אביב', 'Zoo', 'אוכל', 'בית'].map((name, i) => ({
        id: `00000000-0000-4000-8000-00000000000${i}`,
        name,
        deleted: false,
        importance: null,
        color: 'slate' as const,
        tags: name === 'אוכל' ? [tag('t1', 'תה'), tag('t2', 'אורז')] : [],
      })),
    };
    render(
      <TaxonomyPicker
        taxonomy={sorted}
        value={{ categoryIds: [], tagIds: [], newCategories: ['ים', 'דגים'], newTags: [] }}
        onChange={() => undefined}
      />,
    );
    const names = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    const at = (n: string) => names.findIndex((t) => t.startsWith(n));
    const order = ['אוכל', 'בית', 'תל אביב', 'Zoo', 'דגים', 'ים'].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(at('אורז')).toBeLessThan(at('תה'));
  });
});

describe('TaxonomyPicker on small screens', () => {
  beforeAll(() => i18n.changeLanguage('en'));
  afterAll(() => i18n.changeLanguage('he'));
  const A = '22222222-2222-4222-8222-222222222222';
  const B = '33333333-3333-4333-8333-333333333333';
  const D = '44444444-4444-4444-8444-444444444444';
  const TA = '55555555-5555-4555-8555-555555555555';
  const TB = '66666666-6666-4666-8666-666666666666';
  const cat = (id: string, name: string, tags: { id: string; name: string }[] = []) => ({
    id,
    name,
    deleted: false,
    importance: null,
    color: 'slate' as const,
    tags: tags.map((tg) => ({ ...tg, categoryId: id, deleted: false })),
  });
  const tax: Taxonomy = {
    categories: [
      cat(A, 'Alpha', [{ id: TA, name: 'ta' }]),
      cat(B, 'Beta', [{ id: TB, name: 'tb' }]),
      cat(D, 'Delta'),
    ],
  };
  const base = { categoryIds: [B], tagIds: [TB], newCategories: [], newTags: [] };
  const value = { ...base, suggestedCategoryIds: [A] };

  it('hides non-inline chips and tag rows, shows the more chip on phones only', () => {
    render(<TaxonomyPicker taxonomy={tax} value={value} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Delta' }).className).toContain('max-sm:hidden');
    expect(screen.getByRole('button', { name: 'Alpha' }).className).not.toContain('max-sm:hidden');
    expect(screen.getByRole('button', { name: 'Beta' }).className).not.toContain('max-sm:hidden');
    expect(screen.getByRole('button', { name: 'ta' }).closest('fieldset')?.className).not.toContain(
      'max-sm:hidden',
    );
    expect(screen.getByRole('button', { name: 'More categories' }).className).toContain(
      'sm:hidden',
    );
    cleanup();
    render(
      <TaxonomyPicker
        taxonomy={tax}
        value={{ ...value, suggestedCategoryIds: [] }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'ta' }).closest('fieldset')?.className).toContain(
      'max-sm:hidden',
    );
  });

  it('filters the dialog rows and shows the empty message', () => {
    render(<TaxonomyPicker taxonomy={tax} value={value} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.change(within(dialog).getByLabelText('Search categories'), {
      target: { value: '  DEL ' },
    });
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(within(dialog).getByLabelText('Search categories'), {
      target: { value: 'zzz' },
    });
    expect(within(dialog).getByText(/No category by that name/)).toBeTruthy();
  });

  it('confirms once with the checked ids and drops tags of removed categories', () => {
    const onChange = vi.fn();
    render(<TaxonomyPicker taxonomy={tax} value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/^Alpha/));
    fireEvent.click(within(dialog).getByLabelText('Delta'));
    fireEvent.click(within(dialog).getByLabelText('Beta'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ categoryIds: expect.arrayContaining([A, D]), tagIds: [] }),
    );
    expect(onChange.mock.calls[0]?.[0].categoryIds).toHaveLength(2);
  });

  it('leaves value unchanged on cancel and Escape', async () => {
    const onChange = vi.fn();
    render(<TaxonomyPicker taxonomy={tax} value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Delta'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a dialog pick inline after its chip is un-tapped', () => {
    const Harness = () => {
      const [v, setV] = useState<Picked>({ ...base, categoryIds: [], tagIds: [] });
      return <TaxonomyPicker taxonomy={tax} value={v} onChange={setV} />;
    };
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Delta' }).className).toContain('max-sm:hidden');
    fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Delta'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));
    const chip = screen.getByRole('button', { name: 'Delta' });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(chip.className).not.toContain('max-sm:hidden');
  });
});
