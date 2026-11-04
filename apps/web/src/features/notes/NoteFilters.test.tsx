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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'חלב' } });
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

  it('colors category chips and marks the selected one, in a sheet outside the sticky header', () => {
    const { container } = render(
      <NoteFilters
        filter={{ ...EMPTY_FILTER, categoryIds: [C] }}
        onChange={vi.fn()}
        taxonomy={{
          categories: taxonomy.categories.map((c) =>
            c.id === D ? { ...c, color: 'green' as const } : c,
          ),
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false, name: /^סינון/ }));
    const sheet = screen.getByRole('dialog');
    // Portaled to <body>, so no blurred ancestor can clip it.
    expect(container.contains(sheet)).toBe(false);
    const selected = screen.getByRole('button', { name: 'עבודה' });
    expect(selected.dataset.color).toBe('slate');
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(selected.querySelector('svg')).not.toBeNull();
    const other = screen.getByRole('button', { name: 'ישן' });
    expect(other.dataset.color).toBe('green');
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(other.querySelector('svg')).toBeNull();
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
