import type { Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
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
