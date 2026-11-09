import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_NOTE_FORM, type Note } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { MemoryRouter, Route, Routes } from 'react-router';
import { api } from '../../lib/api';

vi.mock('./checklist', async (orig) => {
  const actual = await orig<typeof import('./checklist')>();
  return { ...actual, checklistProgress: vi.fn(actual.checklistProgress) };
});
vi.mock('../../lib/noteStore', async () => {
  const { api } = await import('../../lib/api');
  return { syncNotes: () => api.notes() };
});
import { i18n } from '../../lib/i18n';
import { NotesScreen } from './NotesScreen';
import { checklistProgress } from './checklist';

const id = '00000000-0000-4000-8000-000000000001';
const note: Note = {
  id,
  clientId: '00000000-0000-4000-8000-100000000001',
  title: null,
  body: 'first note',
  status: 'todo',
  workspaceId: '00000000-0000-4000-8000-0000000000f1',
  importance: null,
  urgency: null,
  dueDate: null,
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
};

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(api, 'notes').mockResolvedValue([note]);
  vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
  vi.spyOn(api, 'workspaces').mockResolvedValue([]);
  vi.spyOn(api, 'settings').mockResolvedValue({
    noteSort: 'newest',
    noteForm: DEFAULT_NOTE_FORM,
    quickActions: ['record'],
  });
});
afterEach(() => {
  localStorage.clear();
  cleanup();
  vi.restoreAllMocks();
});

const setupMemo = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NotesScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('NotesScreen list memoization', () => {
  it('does not re-render a NoteCard when unrelated screen state changes', async () => {
    setupMemo();
    await screen.findByText('first note');
    const filters = screen.getByRole('button', { name: /^Filter/ });
    // Let any post-load renders settle, then count card renders from here.
    await act(async () => {});
    const before = vi.mocked(checklistProgress).mock.calls.length;
    await act(async () => {
      fireEvent.click(filters);
    });
    expect(screen.getByText('first note')).toBeTruthy();
    expect(vi.mocked(checklistProgress).mock.calls.length).toBe(before);
  });

  it('does not re-render NoteList when a toast opens or closes', async () => {
    vi.spyOn(api, 'updateNote').mockResolvedValue({ ...note, snoozedUntil: '2026-12-01' });
    setupMemo();
    await screen.findByText('first note');
    await act(async () => {});
    // A card re-render calls checklistProgress, so its call count proves the list stayed put.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tomorrow/ }));
    });
    // Opening the toast: let the snooze mutation settle, then count card renders from here.
    await screen.findByText(/^Snoozed until/);
    await act(async () => {});
    const before = vi.mocked(checklistProgress).mock.calls.length;
    // Closing it (the undo toast times out by itself) must not redraw the list either.
    await waitFor(() => expect(screen.queryByText(/^Snoozed until/)).toBeNull(), { timeout: 7000 });
    expect(vi.mocked(checklistProgress).mock.calls.length).toBe(before);
  }, 10_000);
});
