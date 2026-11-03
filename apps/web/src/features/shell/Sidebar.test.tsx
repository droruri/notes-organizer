import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Workspace } from '@notes/shared';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { Sidebar } from './Sidebar';

afterEach(cleanup);

describe('Sidebar', () => {
  it('switches workspace in one click and highlights the current one', () => {
    const onSwitch = vi.fn();
    const workspaces: Workspace[] = [
      { id: 'a', name: 'Alpha', isDefault: true, defaultFilter: null },
      { id: 'b', name: 'Beta', isDefault: false, defaultFilter: null },
    ];
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
