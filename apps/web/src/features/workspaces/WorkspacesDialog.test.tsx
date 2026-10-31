import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_NOTE_FORM, type Note, type Workspace } from '@notes/shared';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api, ApiRequestError } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { AuthContext } from '../auth/authContext';
import { HeaderSlot } from '../shell/headerSlot';
import { Screens } from '../shell/Screens';

const GENERAL: Workspace = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'כללי',
  isDefault: true,
};
const KNOWLEDGE: Workspace = {
  id: '00000000-0000-4000-8000-0000000000a2',
  name: 'ידע',
  isDefault: false,
};
const note = (n: number, body: string, workspaceId: string): Note => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  clientId: `00000000-0000-4000-8000-10000000000${n}`,
  title: null,
  body,
  status: 'todo',
  workspaceId,
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(api, 'notes').mockResolvedValue([
    note(1, 'general note', GENERAL.id),
    note(2, 'knowledge note', KNOWLEDGE.id),
  ]);
  vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
  vi.spyOn(api, 'settings').mockResolvedValue({ noteSort: 'newest', noteForm: DEFAULT_NOTE_FORM });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const slot = document.createElement('div');
  document.body.append(slot);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext.Provider value={{ state: 'allowed', isAdmin: false, signOut: async () => {} }}>
        <HeaderSlot value={slot}>
          <MemoryRouter>
            <Screens />
          </MemoryRouter>
        </HeaderSlot>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
const openDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Workspaces' }));
  return screen.findByRole('dialog', { name: 'Workspaces' });
};

describe('workspaces dialog', () => {
  it('lists workspaces; picking one closes it and shows only that workspace’s notes', async () => {
    const list = [GENERAL, KNOWLEDGE];
    vi.spyOn(api, 'workspaces').mockResolvedValue(list);
    setup();
    await screen.findByText('general note');
    expect(screen.queryByText('knowledge note')).toBeNull();
    expect(screen.getByRole('heading', { name: 'כללי' })).toBeTruthy();

    const dialog = await openDialog();
    const radios = within(dialog).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['כללי' + 'Default', 'ידע']);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'ידע' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByText('knowledge note');
    expect(screen.queryByText('general note')).toBeNull();
    expect(screen.getByRole('heading', { name: 'ידע' })).toBeTruthy();
  });

  it('adds a workspace and shows it in the list', async () => {
    const list = [GENERAL];
    vi.spyOn(api, 'workspaces').mockImplementation(async () => [...list]);
    const create = vi.spyOn(api, 'createWorkspace').mockImplementation(async (name) => {
      const created = { id: KNOWLEDGE.id, name, isDefault: false };
      list.push(created);
      return created;
    });
    setup();
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('New workspace name'), {
      target: { value: 'ידע' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await within(dialog).findByRole('radio', { name: 'ידע' });
    expect(create).toHaveBeenCalledWith('ידע');
  });

  it('renames inline: Enter saves, Escape cancels without closing the dialog', async () => {
    vi.spyOn(api, 'workspaces').mockResolvedValue([GENERAL, KNOWLEDGE]);
    const edit = vi.spyOn(api, 'editWorkspace').mockResolvedValue({ ...KNOWLEDGE, name: 'ידע2' });
    setup();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actions for ידע' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    fireEvent.keyDown(within(dialog).getByLabelText('Workspace name'), { key: 'Escape' });
    expect(within(dialog).queryByLabelText('Workspace name')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Workspaces' })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Actions for ידע' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    const input = within(dialog).getByLabelText('Workspace name');
    fireEvent.change(input, { target: { value: 'ידע2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(edit).toHaveBeenCalledWith(KNOWLEDGE.id, { name: 'ידע2' }));
  });

  it('shows a Hebrew-keyed error from the API code on a taken name', async () => {
    vi.spyOn(api, 'workspaces').mockResolvedValue([GENERAL, KNOWLEDGE]);
    vi.spyOn(api, 'editWorkspace').mockRejectedValue(
      new ApiRequestError(409, 'name_taken', 'conflict'),
    );
    setup();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actions for ידע' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    const input = within(dialog).getByLabelText('Workspace name');
    fireEvent.change(input, { target: { value: 'כללי' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((await within(dialog).findByRole('alert')).textContent).toContain('already exists');
  });

  it('makes a workspace the default; the default row offers no delete', async () => {
    vi.spyOn(api, 'workspaces').mockResolvedValue([GENERAL, KNOWLEDGE]);
    const edit = vi
      .spyOn(api, 'editWorkspace')
      .mockResolvedValue({ ...KNOWLEDGE, isDefault: true });
    setup();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actions for כללי' }));
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actions for ידע' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make default' }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith(KNOWLEDGE.id, { isDefault: true }));
  });

  it('deletes after an inline confirm naming the default; the view moves to the default', async () => {
    vi.spyOn(api, 'workspaces').mockResolvedValue([GENERAL, KNOWLEDGE]);
    const del = vi.spyOn(api, 'deleteWorkspace').mockResolvedValue(undefined);
    setup();
    await screen.findByText('general note');
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'ידע' }));
    await screen.findByText('knowledge note');
    const again = await openDialog();
    fireEvent.click(within(again).getByRole('button', { name: 'Actions for ידע' }));
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
    expect(within(again).getByText(/move to “כללי”/)).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    const notesFetches = vi.mocked(api.notes).mock.calls.length;
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith(KNOWLEDGE.id));
    await waitFor(() =>
      expect(vi.mocked(api.notes).mock.calls.length).toBeGreaterThan(notesFetches),
    );
    await screen.findByRole('heading', { name: 'כללי' });
  });
});
