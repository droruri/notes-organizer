import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Note } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { readOutbox } from '../offline/outbox';
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

describe('NotesScreen offline with no loaded data', () => {
  it('shows the Add button and queues a submitted note in the outbox', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NotesScreen importing={false} onImportClose={() => {}} />
      </QueryClientProvider>,
    );
    screen.getByText(/you can still add a note/i);
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'buy milk' } });
    const form = screen.getByRole('textbox').closest('form');
    if (!form) throw new Error('compose form not found');
    fireEvent.submit(form);
    await waitFor(() => expect(readOutbox().map((e) => e.body)).toEqual(['buy milk']));
  });
});

describe('NotesScreen opened from a tag', () => {
  const C = '00000000-0000-4000-8000-000000000001';
  const T1 = '00000000-0000-4000-8000-0000000000a1';
  const note = (n: number, body: string, tagIds: string[]): Note => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    clientId: `00000000-0000-4000-8000-10000000000${n}`,
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });

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
        <NotesScreen initialTagId={T1} importing={false} onImportClose={() => {}} />
      </QueryClientProvider>,
    );
    await screen.findByText('tagged note');
    expect(screen.queryByText('other note')).toBeNull();
  });
});
