import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EMPTY_SUGGESTION, type Note } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { readOutbox } from '../offline/outbox';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { NotesScreen } from './NotesScreen';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const C = '00000000-0000-4000-8000-000000000001';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const note = (n: number, body: string, tagIds: string[]): Note => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  clientId: `00000000-0000-4000-8000-10000000000${n}`,
  title: null,
  body,
  status: 'todo',
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds,
  hasAudio: false,
  attachments: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('NotesScreen offline with no loaded data', () => {
  it('shows the Add button and queues a submitted note in the outbox', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    screen.getByText(/you can still add a note/i);
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'buy milk' } });
    const form = screen.getByLabelText('Text').closest('form');
    if (!form) throw new Error('compose form not found');
    fireEvent.submit(form);
    await waitFor(() => expect(readOutbox().map((e) => e.body)).toEqual(['buy milk']));
  });
});

describe('NotesScreen opened from a tag', () => {
  it('shows only the notes carrying the tag it was opened with', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([
      note(1, 'tagged note', [T1]),
      note(2, 'other note', []),
    ]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({
      categories: [
        {
          id: C,
          name: 'work',
          deleted: false,
          tags: [{ id: T1, categoryId: C, name: 'urgent', deleted: false }],
        },
      ],
    });
    vi.spyOn(api, 'settings').mockResolvedValue({ noteSort: 'newest' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen initialTagId={T1} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('tagged note');
    expect(screen.queryByText('other note')).toBeNull();
  });
});

describe('NotesScreen modes from the URL', () => {
  const setup = (entry: string | { pathname: string; state: unknown }) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([note(1, 'first note', [])]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({ noteSort: 'newest' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <Where />
          <Routes>
            <Route path="/" element={<NotesScreen />}>
              <Route path="new" element={null} />
              <Route path="review" element={null} />
              <Route path="chat" element={null} />
              <Route path="import" element={null} />
              <Route path="notes/:id" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('shows compose on /new', async () => {
    setup('/new');
    await screen.findByRole('button', { name: 'Suggest' });
  });

  it('shows the editor on /notes/:id', async () => {
    setup(`/notes/${note(1, '', []).id}`);
    await screen.findByDisplayValue('first note');
  });

  it('shows the review of the draft in the history state', async () => {
    const draft = {
      note: note(1, 'drafted', []),
      suggestion: EMPTY_SUGGESTION,
    };
    setup({ pathname: '/review', state: draft });
    await screen.findByDisplayValue('drafted');
  });

  it('goes to the list on a bad /review state', async () => {
    setup({ pathname: '/review', state: { junk: true } });
    await screen.findByText('first note');
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('goes to the list for an unknown note id', async () => {
    setup('/notes/00000000-0000-4000-8000-0000000000ff');
    await screen.findByText('first note');
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('opens chat at /chat and closes it back to the list', async () => {
    setup('/');
    await screen.findByText('first note');
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    const drawer = await screen.findByRole('dialog', { name: 'Ask about your notes' });
    expect(screen.getByTestId('where').textContent).toBe('/chat');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.transitionEnd(drawer);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the import dialog on /import', async () => {
    setup('/import');
    await screen.findByRole('dialog', { name: /import/i });
  });
});
