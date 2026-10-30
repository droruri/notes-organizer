import { EMPTY_FILTER, type Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { NoteFilters } from './NoteFilters';

const C = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';
const taxonomy: Taxonomy = {
  categories: [
    { id: C, name: 'עבודה', deleted: false, importance: null, tags: [] },
    { id: D, name: 'ישן', deleted: true, importance: null, tags: [] },
  ],
};
afterEach(cleanup);

describe('NoteFilters', () => {
  it('reports search text', () => {
    const onChange = vi.fn();
    render(<NoteFilters filter={EMPTY_FILTER} onChange={onChange} taxonomy={taxonomy} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'חלב' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, text: 'חלב' });
  });

  it('greys deleted categories but still filters by them', () => {
    const onChange = vi.fn();
    render(<NoteFilters filter={EMPTY_FILTER} onChange={onChange} taxonomy={taxonomy} />);
    fireEvent.click(screen.getByRole('button', { name: 'סינון' }));
    const deleted = screen.getByRole('button', { name: 'ישן' });
    expect(deleted.className).toContain('opacity-60');
    fireEvent.click(deleted);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, categoryIds: [D] });
  });

  it('toggles a status', () => {
    const onChange = vi.fn();
    render(<NoteFilters filter={EMPTY_FILTER} onChange={onChange} taxonomy={taxonomy} />);
    fireEvent.click(screen.getByRole('button', { name: 'סינון' }));
    fireEvent.click(screen.getByRole('button', { name: 'הושלם' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, statuses: ['done'] });
  });
});
