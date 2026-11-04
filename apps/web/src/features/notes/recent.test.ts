import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { parseRecent, recordOpen } from './recent';

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
