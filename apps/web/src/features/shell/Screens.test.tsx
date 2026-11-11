import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { i18n } from '../../lib/i18n';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Note } from '@notes/shared';
import { api } from '../../lib/api';
import { AuthContext } from '../auth/authContext';

vi.mock('../../lib/noteStore', () => ({ syncNotes: vi.fn(async () => []) }));
vi.mock('../notes/NotesScreen', () => ({ NotesScreen: () => <p>notes list</p> }));
vi.mock('../users/UsersScreen', () => ({ UsersScreen: () => <p>users screen</p> }));

import { syncNotes } from '../../lib/noteStore';
import { Screens } from './Screens';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

describe('Screens Today badge', () => {
  const today = new Date().toLocaleDateString('en-CA');
  const note = (id: string, workspaceId: string, o: Partial<Note> = {}): Note => ({
    id,
    clientId: id,
    title: null,
    body: 'x',
    status: 'todo',
    workspaceId,
    importance: null,
    urgency: null,
    dueDate: today,
    snoozedUntil: null,
    remindAt: null,
    proposed: null,
    unreadLinks: [],
    categoryIds: [],
    tagIds: [],
    hasAudio: false,
    attachments: [],
    checklist: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...o,
  });

  it('counts overdue + due today of the current workspace only', async () => {
    vi.spyOn(api, 'workspaces').mockResolvedValue([
      { id: 'a', name: 'A', isDefault: true, defaultFilter: null },
      { id: 'b', name: 'B', isDefault: false, defaultFilter: null },
    ]);
    vi.mocked(syncNotes).mockResolvedValue([
      note('1', 'a'),
      note('2', 'a', { dueDate: '2000-01-01' }),
      note('3', 'a', { status: 'done' }),
      note('4', 'b'),
    ]);
    renderAt('/', false);
    expect(
      (await screen.findAllByRole('button', { name: i18n.t('today.badge', { count: 2 }) })).length,
    ).toBeGreaterThan(0);
  });
});
