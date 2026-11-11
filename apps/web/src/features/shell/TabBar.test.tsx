import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { TabBar } from './TabBar';

afterEach(cleanup);

describe('TabBar', () => {
  it('shows five tabs, marks Notes current, and opens the Workspaces and More tabs', () => {
    const onPick = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <TabBar onPick={onPick} dueCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(
      screen.getByRole('button', { name: i18n.t('notes.title') }).getAttribute('aria-current'),
    ).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: i18n.t('workspaces.menu') }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('app.menu') }));
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(['workspaces', 'more']);
  });

  it('shows the due count on Today, 99+ above 99, nothing at zero', () => {
    const view = (count: number) =>
      render(
        <MemoryRouter initialEntries={['/']}>
          <TabBar onPick={vi.fn()} dueCount={count} />
        </MemoryRouter>,
      );
    const { unmount } = view(3);
    expect(
      screen.getByRole('button', { name: i18n.t('today.badge', { count: 3 }) }).textContent,
    ).toContain('3');
    unmount();
    const second = view(150);
    expect(screen.getByText('99+')).toBeTruthy();
    second.unmount();
    view(0);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByRole('button', { name: i18n.t('today.title') })).toBeTruthy();
  });

  it('uses the Hebrew plural forms for the Today name', async () => {
    const he = i18n.getFixedT('he');
    expect(he('today.badge', { count: 1 })).toBe('היום, משימה אחת');
    expect(he('today.badge', { count: 2 })).toBe('היום, 2 משימות');
    expect(he('today.badge', { count: 11 })).toBe('היום, 11 משימות');
  });

  it('hides on pushed screens', () => {
    render(
      <MemoryRouter initialEntries={['/notes/abc']}>
        <TabBar onPick={vi.fn()} dueCount={0} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('marks Today current on /?view=today and not Notes, and the reverse on /', () => {
    const current = (entry: string) => {
      const { unmount } = render(
        <MemoryRouter initialEntries={[entry]}>
          <TabBar onPick={vi.fn()} dueCount={0} />
        </MemoryRouter>,
      );
      const names = screen
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-current') === 'page')
        .map((b) => b.textContent);
      unmount();
      return names;
    };
    expect(current('/?view=today')).toEqual([i18n.t('today.title')]);
    expect(current('/')).toEqual([i18n.t('notes.title')]);
    expect(current('/?view=bogus')).toEqual([i18n.t('notes.title')]);
  });
});
