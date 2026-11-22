import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const cleared = vi.hoisted(() => [] as number[]);
const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  createStore: () => undefined,
  entries: async () => [],
  clear: async () => {},
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => void store.set(k, v),
  del: async (k: string) => void store.delete(k),
}));

vi.mock('./noteStore', () => ({
  loadNotes: async () => ({ notes: [{ id: 'n1' }], syncedAt: 1_700_000_000_000 }),
  clearNotes: async () => void cleared.push(1),
}));

import { clearCache, persister, shouldDehydrateQuery } from './queryPersist';

const persisted = (queries: unknown[]) => ({
  timestamp: Date.now(),
  buster: '',
  clientState: { mutations: [], queries },
});
const q = (queryKey: unknown[], data: unknown) => ({
  queryKey,
  queryHash: JSON.stringify(queryKey),
  state: { data, status: 'success' },
});

beforeEach(() => {
  store.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('query cache persistence', () => {
  it('restores a valid note list and drops an invalid one without crashing', async () => {
    store.set(
      'notes-query-cache-v1',
      persisted([
        q(['taxonomy'], { categories: 'nope' }),
        q(['settings'], { noteSort: 'newest' }),
        q(['users'], []),
      ]),
    );
    const restored = await persister.restoreClient();
    const keys = restored?.clientState.queries.map((x) => x.queryKey[0]);
    expect(keys).not.toContain('taxonomy');
    expect(keys).not.toContain('users');
    // A settings cache saved before noteForm existed still restores.
    expect(keys).toContain('settings');
  });

  it('adds the device notes as a stale notes query on restore', async () => {
    const restored = await persister.restoreClient();
    const notes = restored?.clientState.queries.find((x) => x.queryKey[0] === 'notes');
    expect(notes?.state.dataUpdatedAt).toBe(1_700_000_000_000);
    expect(notes?.state.data).toEqual([{ id: 'n1' }]);
    // Stale: a restored query with default staleTime 0 refetches on mount.
    const qc = new QueryClient();
    qc.setQueryData(['notes'], [], { updatedAt: notes?.state.dataUpdatedAt ?? 0 });
    expect(
      qc
        .getQueryCache()
        .find({ queryKey: ['notes'] })
        ?.isStaleByTime(0),
    ).toBe(true);
  });

  it('clearCache empties the note store', async () => {
    cleared.length = 0;
    await clearCache(new QueryClient());
    expect(cleared).toHaveLength(1);
  });

  it('returns nothing for garbage', async () => {
    store.set('notes-query-cache-v1', 'garbage');
    expect(
      (await persister.restoreClient())?.clientState.queries.map((x) => x.queryKey[0]),
    ).toEqual(['notes']);
  });

  it('persists no notes in the blob, only taxonomy, settings, workspaces', () => {
    const qc = new QueryClient();
    qc.setQueryData(['notes'], []);
    qc.setQueryData(['audio', 'x'], 1);
    const keep = qc
      .getQueryCache()
      .getAll()
      .filter((x) => shouldDehydrateQuery(x))
      .map((x) => x.queryKey[0]);
    expect(keep).toEqual([]);
  });

  it('clearCache removes the persisted cache and empties memory', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['notes'], []);
    await persister.persistClient(persisted([q(['notes'], [])]) as never);
    expect(store.has('notes-query-cache-v1')).toBe(true);
    await clearCache(qc);
    expect(store.has('notes-query-cache-v1')).toBe(false);
    expect(qc.getQueryData(['notes'])).toBeUndefined();
  });
});
