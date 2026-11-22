import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Note } from '@notes/shared';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../lib/api';
import {
  notesKeys,
  useChangeNoteStatus,
  useCreateNote,
  useCreateVoiceNote,
  useUpdateNote,
} from './notes.queries';
import { taxonomyKeys } from './taxonomy.queries';

afterEach(() => vi.restoreAllMocks());

const note = (id: string, status: Note['status'] = 'todo'): Note => ({
  id,
  clientId: id,
  title: null,
  body: id,
  status,
  workspaceId: 'ws',
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
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useChangeNoteStatus', () => {
  it('writes the server copy into the notes cache, then invalidates notes', async () => {
    const saved = note('b', 'done');
    vi.spyOn(api, 'updateNote').mockResolvedValue(saved);
    const { client, wrapper } = setup();
    client.setQueryData(notesKeys.all, [note('a'), note('b')]);
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useChangeNoteStatus(), { wrapper });
    act(() => result.current.mutate({ id: 'b', status: 'done' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: notesKeys.all }));
    expect(client.getQueryData<Note[]>(notesKeys.all)?.[1]).toEqual(saved);
    expect(api.updateNote).toHaveBeenCalledWith('b', { status: 'done' });
  });
});

describe('useUpdateNote', () => {
  it('invalidates notes and taxonomy', async () => {
    vi.spyOn(api, 'updateNote').mockResolvedValue(note('a'));
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateNote(), { wrapper });
    act(() => result.current.mutate({ id: 'a', edit: { title: 'x' } }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const keys = spy.mock.calls.map(([f]) => f?.queryKey);
    expect(keys).toContainEqual(notesKeys.all);
    expect(keys).toContainEqual(taxonomyKeys.all);
  });
});

describe('create hooks', () => {
  const meta = { clientId: 'c1', today: '2026-10-26', locale: 'en' as const };

  it('useCreateNote passes an abort signal to the request', async () => {
    const spy = vi.spyOn(api, 'createNote').mockReturnValue(new Promise<never>(() => undefined));
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateNote(), { wrapper });
    act(() => result.current.mutate({ body: 'x', ...meta }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
  });

  it('useCreateVoiceNote passes an abort signal to the request', async () => {
    const spy = vi
      .spyOn(api, 'createVoiceNote')
      .mockReturnValue(new Promise<never>(() => undefined));
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateVoiceNote(), { wrapper });
    act(() => result.current.mutate({ audio: new Blob(['a']), meta }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
  });
});
