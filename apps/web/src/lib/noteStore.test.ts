import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Note } from '@notes/shared';

const db = vi.hoisted(() => new Map<string, unknown>());
const calls = vi.hoisted(() => ({ setMany: [] as string[][], delMany: [] as string[][] }));
vi.mock('idb-keyval', () => ({
  createStore: () => undefined,
  entries: async () => [...db.entries()],
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  clear: async () => db.clear(),
  setMany: async (e: [string, unknown][]) => {
    calls.setMany.push(e.map(([k]) => k));
    for (const [k, v] of e) db.set(k, v);
  },
  delMany: async (ks: string[]) => {
    calls.delMany.push(ks);
    for (const k of ks) db.delete(k);
  },
}));
const noteChanges = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ api: { noteChanges } }));

import { clearNotes, loadNotes, syncNotes } from './noteStore';

const mk = (n: number, createdAt: string): Note => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  clientId: `10000000-0000-4000-8000-00000000000${n}`,
  title: null,
  body: `b${n}`,
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
  createdAt,
  updatedAt: createdAt,
});
const a = mk(1, '2026-10-01T10:00:00.000Z');
const b = mk(2, '2026-10-02T10:00:00.000Z');
const c = mk(3, '2026-10-02T10:00:00.000Z');

beforeEach(() => {
  db.clear();
  calls.setMany.length = 0;
  calls.delMany.length = 0;
  noteChanges.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('noteStore', () => {
  it('first sync is full, stores every note and the cursor, sorted', async () => {
    noteChanges.mockResolvedValue({ notes: [a, b, c], deletedIds: [], cursor: 'c1' });
    const out = await syncNotes(undefined);
    expect(noteChanges).toHaveBeenCalledWith(undefined);
    expect(out.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
    expect(db.size).toBe(4);
    expect(await loadNotes()).toEqual(out);
  });

  it('second sync sends the cursor and writes only the changes', async () => {
    noteChanges.mockResolvedValueOnce({ notes: [a, b], deletedIds: [], cursor: 'c1' });
    const first = await syncNotes(undefined);
    const a2 = { ...a, body: 'edited' };
    noteChanges.mockResolvedValueOnce({ notes: [a2], deletedIds: [b.id], cursor: 'c2' });
    const out = await syncNotes(first);
    expect(noteChanges).toHaveBeenLastCalledWith('c1');
    expect(out).toEqual([a2]);
    expect(calls.setMany.at(-1)).toEqual([a.id, '__meta__']);
    expect(calls.delMany.at(-1)).toEqual([b.id]);
    expect(db.get('__meta__')).toEqual({ version: 1, cursor: 'c2' });
  });

  it('wipes the store on an invalid record', async () => {
    noteChanges.mockResolvedValue({ notes: [a], deletedIds: [], cursor: 'c1' });
    await syncNotes(undefined);
    db.set(b.id, { nope: true });
    expect(await loadNotes()).toBeUndefined();
    expect(db.size).toBe(0);
  });

  it('wipes the store on an old version', async () => {
    noteChanges.mockResolvedValue({ notes: [a], deletedIds: [], cursor: 'c1' });
    await syncNotes(undefined);
    db.set('__meta__', { version: 0, cursor: 'c1' });
    expect(await loadNotes()).toBeUndefined();
    expect(db.size).toBe(0);
  });

  it('clearNotes empties the store', async () => {
    db.set(a.id, a);
    await clearNotes();
    expect(db.size).toBe(0);
  });
});
