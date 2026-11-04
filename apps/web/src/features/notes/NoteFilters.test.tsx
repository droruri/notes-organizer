import { EMPTY_FILTER, type Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { NoteFilters } from './NoteFilters';

const C = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';
const taxonomy: Taxonomy = {
  categories: [
    {
      id: C,
      name: 'עבודה',
      deleted: false,
      importance: null,
      color: 'slate' as const,
      pinned: false,
      tags: [],
    },
    {
      id: D,
      name: 'ישן',
      deleted: true,
      importance: null,
      color: 'slate' as const,
      pinned: false,
      tags: [],
    },
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

  it('puts the filters and the sort in one sheet, with the active count on the button', () => {
    render(
      <NoteFilters
        filter={{ ...EMPTY_FILTER, categoryIds: [C], statuses: ['done'] }}
        onChange={vi.fn()}
        taxonomy={taxonomy}
        sort={<select aria-label="sort-test" />}
      />,
    );
    expect(screen.queryByLabelText('sort-test')).toBeNull();
    const button = screen.getByRole('button', { name: /^סינון/ });
    expect(button.textContent).toContain('2');
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(screen.getByLabelText('sort-test'))).toBe(true);
  });

  it('toggles a status', () => {
    const onChange = vi.fn();
    render(<NoteFilters filter={EMPTY_FILTER} onChange={onChange} taxonomy={taxonomy} />);
    fireEvent.click(screen.getByRole('button', { name: 'סינון' }));
    fireEvent.click(screen.getByRole('button', { name: 'הושלם' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, statuses: ['done'] });
  });

  it('shows the all-workspaces toggle only when offered, and reports it', () => {
    const onAll = vi.fn();
    const { rerender } = render(
      <NoteFilters filter={EMPTY_FILTER} onChange={vi.fn()} taxonomy={taxonomy} />,
    );
    expect(screen.queryByRole('button', { name: 'בכל סביבות העבודה' })).toBeNull();
    rerender(
      <NoteFilters
        filter={EMPTY_FILTER}
        onChange={vi.fn()}
        taxonomy={taxonomy}
        showAllWorkspaces
        allWorkspaces={false}
        onAllWorkspaces={onAll}
      />,
    );
    const chip = screen.getByRole('button', { name: 'בכל סביבות העבודה' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(onAll).toHaveBeenCalledWith(true);
  });
});
