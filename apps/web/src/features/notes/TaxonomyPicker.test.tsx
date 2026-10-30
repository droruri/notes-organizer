import type { Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { pickedFrom } from './picked';
import { TaxonomyPicker } from './TaxonomyPicker';

const C = '11111111-1111-4111-8111-111111111111';
const taxonomy: Taxonomy = {
  categories: [{ id: C, name: 'עבודה', deleted: false, importance: null, tags: [] }],
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
