import { EMPTY_FILTER } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { CategoryStrip } from './CategoryStrip';
import type { RankedCategory } from './categoryRank';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const mm = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({
    matches,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
const ranked: RankedCategory[] = ids.map((id, i) => ({
  category: { id, name: `Cat${i}`, deleted: false, importance: null, color: 'blue' },
  count: i,
  latest: 0,
}));

describe('CategoryStrip', () => {
  it('toggles a category and marks it pressed', () => {
    mm(true);
    const onChange = vi.fn();
    const { rerender } = render(
      <CategoryStrip
        ranked={ranked}
        filter={EMPTY_FILTER}
        onChange={onChange}
        onOpenAll={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cat1 (1)' }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, categoryIds: [ids[1]] });
    const on = { ...EMPTY_FILTER, categoryIds: [ids[1] ?? ''] };
    rerender(<CategoryStrip ranked={ranked} filter={on} onChange={onChange} onOpenAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cat1 (1)' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cat1 (1)' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, categoryIds: [] });
  });
  it('shows 8 on desktop, 3 plus +N below lg, and opens the sheet', () => {
    mm(true);
    const onOpenAll = vi.fn();
    render(
      <CategoryStrip
        ranked={ranked}
        filter={EMPTY_FILTER}
        onChange={vi.fn()}
        onOpenAll={onOpenAll}
      />,
    );
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'הכל ›' }));
    expect(onOpenAll).toHaveBeenCalled();
    cleanup();
    mm(false);
    render(
      <CategoryStrip
        ranked={ranked}
        filter={EMPTY_FILTER}
        onChange={vi.fn()}
        onOpenAll={onOpenAll}
      />,
    );
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '+7' }));
    expect(onOpenAll).toHaveBeenCalledTimes(2);
  });
});
