import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => void store.set(k, v),
  del: async (k: string) => void store.delete(k),
}));

import { clearCache, persister, shouldDehydrateQuery } from './queryPersist';

const note = {
  id: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  title: null,
  body: 'hello',
  status: 'todo',
  workspaceId: '00000000-0000-4000-8000-0000000000f1',
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T10:00:00.000Z',
};

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
        q(['notes'], [note]),
        q(['taxonomy'], { categories: 'nope' }),
        q(['settings'], { noteSort: 'newest' }),
        q(['users'], []),
      ]),
    );
    const restored = await persister.restoreClient();
    const keys = restored?.clientState.queries.map((x) => x.queryKey[0]);
    expect(keys).not.toContain('taxonomy');
    expect(keys).not.toContain('users');
    expect(keys).toContain('notes');
    // A settings cache saved before noteForm existed still restores.
    expect(keys).toContain('settings');
  });

  it('returns nothing for garbage', async () => {
    store.set('notes-query-cache-v1', 'garbage');
    expect(await persister.restoreClient()).toBeUndefined();
    store.set('notes-query-cache-v1', { timestamp: 1, buster: '', clientState: {} });
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it('persists only notes, taxonomy and settings', () => {
    const qc = new QueryClient();
    qc.setQueryData(['notes'], []);
    qc.setQueryData(['audio', 'x'], 1);
    const keep = qc
      .getQueryCache()
      .getAll()
      .filter((x) => shouldDehydrateQuery(x))
      .map((x) => x.queryKey[0]);
    expect(keep).toEqual(['notes']);
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
