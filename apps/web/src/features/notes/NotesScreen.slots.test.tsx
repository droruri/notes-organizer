import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { DEFAULT_NOTE_FORM, type Note } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { MemoryRouter, Route, Routes } from 'react-router';
import { api } from '../../lib/api';

vi.mock('../../lib/noteStore', async () => {
  const { api } = await import('../../lib/api');
  return { syncNotes: () => api.notes() };
});
import { i18n } from '../../lib/i18n';
import { NotesScreen } from './NotesScreen';

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

const setup = (entry: string) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<NotesScreen />}>
            <Route path="new" element={null} />
            <Route path="notes/:id" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('NotesScreen list and detail slots', () => {
  it('keeps the list mounted but hidden while a note is open', async () => {
    const { container } = setup(`/notes/${id}`);
    await screen.findByDisplayValue('first note');
    const list = container.querySelector('[data-slot="list"]');
    expect(list).not.toBeNull();
    // Hidden by CSS: the list sits under the data-detail-open container (see styles.css).
    expect(list?.parentElement?.hasAttribute('data-detail-open')).toBe(true);
    expect(list?.textContent).toContain('first note');
    expect(container.querySelector('[data-slot="detail"]')).not.toBeNull();
  });

  it('keeps the list mounted but hidden on /new', async () => {
    const { container } = setup('/new');
    await screen.findByRole('button', { name: 'Suggest' });
    expect(
      container
        .querySelector('[data-slot="list"]')
        ?.parentElement?.hasAttribute('data-detail-open'),
    ).toBe(true);
  });

  it('shows the list and no detail on /', async () => {
    const { container } = setup('/');
    await screen.findByText('first note');
    expect(
      container
        .querySelector('[data-slot="list"]')
        ?.parentElement?.hasAttribute('data-detail-open'),
    ).toBe(false);
  });
});
