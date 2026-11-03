import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

afterEach(cleanup);

describe('TabBar', () => {
  it('shows four tabs, marks Notes current, and opens the Workspaces and More tabs', () => {
    const onPick = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <TabBar onPick={onPick} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
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
});

describe('Sidebar', () => {
  it('switches workspace in one click and highlights the current one', () => {
    const onSwitch = vi.fn();
    const workspaces = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ] as never;
    render(
      <MemoryRouter>
        <Sidebar
          workspaces={workspaces}
          currentId="a"
          onSwitch={onSwitch}
          onManage={vi.fn()}
          onPick={vi.fn()}
          onSignOut={vi.fn()}
          isAdmin={false}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onSwitch).toHaveBeenCalledWith('b');
    expect(screen.getByRole('menuitem', { name: i18n.t('auth.signOut') })).toBeTruthy();
  });
});
