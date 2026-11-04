import { EMPTY_FILTER, type Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ActiveFilters } from './ActiveFilters';

const C = '11111111-1111-4111-8111-111111111111';
const taxonomy: Taxonomy = {
  categories: [
    {
      id: C,
      name: 'עבודה',
      deleted: false,
      importance: null,
      color: 'blue',
      pinned: false,
      tags: [],
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const matchMedia = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe('ActiveFilters', () => {
  it('renders nothing when no filter is active', () => {
    const { container } = render(
      <ActiveFilters
        filter={{ ...EMPTY_FILTER, text: 'x' }}
        taxonomy={taxonomy}
        onChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('removes only the clicked value', () => {
    const onChange = vi.fn();
    const filter = { ...EMPTY_FILTER, categoryIds: [C], statuses: ['done' as const] };
    render(<ActiveFilters filter={filter} taxonomy={taxonomy} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'הסר סינון: עבודה' }));
    expect(onChange).toHaveBeenCalledWith({ ...filter, categoryIds: [] });
  });

  it('clears everything but keeps the search text', () => {
    const onChange = vi.fn();
    const filter = { ...EMPTY_FILTER, text: 'חלב', categoryIds: [C] };
    render(<ActiveFilters filter={filter} taxonomy={taxonomy} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'נקה הכל' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, text: 'חלב' });
  });

  it('does not crash on an unknown id', () => {
    render(
      <ActiveFilters
        filter={{ ...EMPTY_FILTER, categoryIds: ['99999999-9999-4999-8999-999999999999'] }}
        taxonomy={taxonomy}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /הסר סינון/ })).toBeNull();
  });

  const many = {
    ...EMPTY_FILTER,
    categoryIds: [C],
    statuses: ['done' as const, 'todo' as const],
    importances: ['important' as const],
    urgencies: ['urgent' as const, 'medium' as const],
  };

  it('below lg caps the row and expands in place with +N', () => {
    matchMedia(false);
    render(<ActiveFilters filter={many} taxonomy={taxonomy} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /הסר סינון/ })).toHaveLength(1);
    const more = screen.getByRole('button', { name: '+5' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(screen.getAllByRole('button', { name: /הסר סינון/ })).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'הצג פחות' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('at lg+ shows every chip', () => {
    matchMedia(true);
    render(<ActiveFilters filter={many} taxonomy={taxonomy} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /הסר סינון/ })).toHaveLength(6);
    expect(screen.queryByRole('button', { name: '+4' })).toBeNull();
  });
});
