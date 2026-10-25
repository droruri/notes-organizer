import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => void store.set(k, v),
  del: async (k: string) => void store.delete(k),
}));

import { addToOutbox, readOutbox, readOutboxAudio, removeFromOutbox } from './outbox';

const id = () => crypto.randomUUID();

beforeEach(() => {
  localStorage.clear();
  store.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('outbox', () => {
  it('round-trips a text note and removes it', async () => {
    const clientId = id();
    expect(await addToOutbox({ clientId, body: 'buy milk' })).toBe(true);
    expect(readOutbox()).toMatchObject([{ clientId, body: 'buy milk', hasAudio: false }]);
    await removeFromOutbox(clientId);
    expect(readOutbox()).toEqual([]);
  });

  it('drops a corrupt entry with a warning and keeps the good one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clientId = id();
    await addToOutbox({ clientId, body: 'ok' });
    const good: unknown = JSON.parse(localStorage.getItem('notes-outbox-v1') ?? '[]');
    localStorage.setItem(
      'notes-outbox-v1',
      JSON.stringify([{ clientId: 'nope' }, ...(Array.isArray(good) ? good : [])]),
    );
    expect(readOutbox().map((e) => e.clientId)).toEqual([clientId]);
    expect(warn).toHaveBeenCalled();
  });

  it('returns an empty list for unparseable storage', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localStorage.setItem('notes-outbox-v1', '{not json');
    expect(readOutbox()).toEqual([]);
  });

  it('keeps the recording by clientId and deletes it with the entry', async () => {
    const clientId = id();
    const blob = new Blob(['abc'], { type: 'audio/webm' });
    await addToOutbox({ clientId, body: '' }, blob);
    expect(readOutbox()[0]?.hasAudio).toBe(true);
    expect(await readOutboxAudio(clientId)).toBe(blob);
    await removeFromOutbox(clientId);
    expect(await readOutboxAudio(clientId)).toBeUndefined();
  });

  it('reports failure instead of throwing when storage is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(await addToOutbox({ clientId: id(), body: 'x' })).toBe(false);
  });
});
