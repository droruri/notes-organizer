import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Note } from '@notes/shared';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../lib/api';
import { notesKeys, useChangeNoteStatus, useUpdateNote } from './notes.queries';
import { taxonomyKeys } from './taxonomy.queries';

afterEach(() => vi.restoreAllMocks());

const note = (id: string, status: Note['status'] = 'todo'): Note =>
  ({ id, body: id, status }) as Note;

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
