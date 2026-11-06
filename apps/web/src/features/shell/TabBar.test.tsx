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
        <TabBar onPick={onPick} />
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

  it('hides on pushed screens', () => {
    render(
      <MemoryRouter initialEntries={['/notes/abc']}>
        <TabBar onPick={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('marks Today current on /?view=today and not Notes, and the reverse on /', () => {
    const current = (entry: string) => {
      const { unmount } = render(
        <MemoryRouter initialEntries={[entry]}>
          <TabBar onPick={vi.fn()} />
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
