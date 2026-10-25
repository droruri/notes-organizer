import type { LinkContext } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../../ai/provider';
import type { LinkReader } from '../links/preview';
import { analyzeImport, readImportLinks } from './analyze';

const reader = (overrides: Partial<LinkReader> = {}): LinkReader & { batches: string[][] } => {
  const batches: string[][] = [];
  return {
    batches,
    preview: async () => null,
    read: async (url) => ({ url, ok: true }),
    readAll: async (urls) => {
      batches.push(urls);
      return urls.map((url): LinkContext => ({ url, ok: true }));
    },
    ...overrides,
  };
};

const input = { text: 'x', today: '2026-01-01', locale: 'en' as const };

describe('analyzeImport', () => {
  it('reads the first 30 links 5 at a time and reports the rest as unread', async () => {
    const urls = Array.from({ length: 31 }, (_, i) => `https://e.test/${i}`);
    const r = reader();
    const ai = createFakeAi([
      {
        value: {
          notes: [
            { body: `first ${urls.slice(0, 30).join(' ')}` },
            { body: `last ${urls[30]}`, newCategories: ['Reading'] },
          ],
        },
      },
    ]);
    const result = await analyzeImport(
      ai,
      r,
      { categories: [] },
      { ...input, text: urls.join('\n') },
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.links).toEqual({ total: 31, read: 30 });
    expect(r.batches.map((b) => b.length)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(result.value.notes[0]?.suggestion.unreadLinks).toEqual([]);
    expect(result.value.notes[1]?.suggestion.unreadLinks).toEqual([urls[30]]);
    expect(result.value.newCategories).toEqual(['Reading']);
  });

  it('keeps at most 200 notes and drops empty ones', async () => {
    const notes = [{ body: '  ' }, ...Array.from({ length: 250 }, (_, i) => ({ body: `n${i}` }))];
    const result = await analyzeImport(
      createFakeAi([{ value: { notes } }]),
      reader(),
      { categories: [] },
      input,
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.notes).toHaveLength(200);
  });

  it('fails when Claude does', async () => {
    const result = await analyzeImport(
      createFakeAi([{ fail: 'boom' }]),
      reader(),
      { categories: [] },
      input,
    );
    expect(result).toEqual({ ok: false, error: 'ai_unavailable' });
  });
});

describe('readImportLinks', () => {
  it('leaves links unread when the budget runs out', async () => {
    const slow = reader({ readAll: () => new Promise(() => undefined) });
    const out = await readImportLinks(slow, ['https://a.test/'], 10);
    expect(out).toEqual([{ url: 'https://a.test/', ok: false }]);
  });
});
