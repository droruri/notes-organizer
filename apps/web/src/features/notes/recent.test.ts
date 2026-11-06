import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Note } from '@notes/shared';
import { continueNotes, parseRecent, recordOpen } from './recent';

afterEach(() => localStorage.clear());

describe('recent', () => {
  it('puts the newest first, dedupes and caps at 20', () => {
    for (let i = 0; i < 25; i++) recordOpen(`n${i}`, i);
    recordOpen('n10', 100);
    const items = parseRecent(localStorage.getItem('recentNotes'));
    expect(items).toHaveLength(20);
    expect(items[0]?.id).toBe('n10');
    expect(items.filter((i) => i.id === 'n10')).toHaveLength(1);
  });

  it('treats corrupt or wrong-shaped values as empty', () => {
    expect(parseRecent('{nope')).toEqual([]);
    expect(parseRecent(JSON.stringify({ v: 2, items: [] }))).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
  });

  it('never throws when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private');
    });
    expect(() => recordOpen('a')).not.toThrow();
    spy.mockRestore();
  });
});

describe('continueNotes', () => {
  const note = (i: number, o: Partial<Note> = {}): Note => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    clientId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
    title: `note ${i}`,
    body: '',
    status: null,
    workspaceId: '00000000-0000-4000-a000-000000000000',
    importance: null,
    urgency: null,
    dueDate: null,
    snoozedUntil: null,
    proposed: null,
    unreadLinks: [],
    categoryIds: [],
    tagIds: [],
    hasAudio: false,
    attachments: [],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    ...o,
  });

  it('caps at 8: 5 recents first, then due/overdue notes not already shown', () => {
    const recents = Array.from({ length: 6 }, (_, i) => note(i + 1));
    const due = Array.from({ length: 5 }, (_, i) =>
      note(i + 20, { dueDate: '2026-10-20', status: 'todo' }),
    );
    const ids = recents.map((n) => n.id);
    const out = continueNotes([...recents, ...due], ids, '2026-10-25');
    expect(out.length).toBe(8);
    expect(out.slice(0, 5).map((n) => n.id)).toEqual(ids.slice(0, 5));
    expect(out.slice(5).every((n) => n.dueDate !== null)).toBe(true);
  });
});
