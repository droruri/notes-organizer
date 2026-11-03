import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { i18n } from '../../lib/i18n';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { AuthContext } from '../auth/authContext';

vi.mock('../notes/NotesScreen', () => ({ NotesScreen: () => <p>notes list</p> }));
vi.mock('../users/UsersScreen', () => ({ UsersScreen: () => <p>users screen</p> }));

import { Screens } from './Screens';

afterEach(cleanup);

const renderAt = (path: string, isAdmin: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={{ state: 'allowed', isAdmin, signOut: async () => {} }}>
        <MemoryRouter initialEntries={[path]}>
          <Screens />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

describe('Screens routes', () => {
  it('shows the notes list to a non-admin at /users', () => {
    renderAt('/users', false);
    expect(screen.getByText('notes list')).toBeTruthy();
  });

  it('shows Users to an admin at /users', async () => {
    renderAt('/users', true);
    expect(await screen.findByText('users screen')).toBeTruthy();
  });

  it('opens the More sheet from the tab bar', () => {
    renderAt('/', false);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('app.menu') }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('menuitem', { name: i18n.t('auth.signOut') })).toBeTruthy();
  });

  it('redirects unknown paths to the notes list', () => {
    renderAt('/nope', true);
    expect(screen.getByText('notes list')).toBeTruthy();
  });
});
