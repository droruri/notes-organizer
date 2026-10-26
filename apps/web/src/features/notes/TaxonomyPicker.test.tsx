import type { Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { pickedFrom } from './picked';
import { TaxonomyPicker } from './TaxonomyPicker';

const C = '11111111-1111-4111-8111-111111111111';
const taxonomy: Taxonomy = {
  categories: [{ id: C, name: 'עבודה', deleted: false, tags: [] }],
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
});
