import type { LinkContext } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../../ai/provider';
import { allowListDb } from '../../test-auth';
import { captureLogs } from '../../test-logs';
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

describe('import analyze outcome logs (in a request)', () => {
  const headers = { authorization: 'Bearer allowed' };
  const payload = {
    text: 'secret import text',
    today: new Date().toISOString().slice(0, 10),
    locale: 'en',
  };

  it('logs import analyzed with counts and no text', async () => {
    const { app, lines } = captureLogs({
      db: allowListDb,
      turns: [{ value: { notes: [{ body: 'secret import text' }] } }],
    });
    const res = await app.inject({ method: 'POST', url: '/imports/analyze', headers, payload });
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(lines.find((l) => l.msg === 'import analyzed')).toMatchObject({
      level: 30,
      chars: payload.text.length,
      notes: 1,
      links: { total: 0, read: 0 },
    });
    expect(JSON.stringify(lines)).not.toContain('secret import text');
  });

  it('warns on ai_unavailable', async () => {
    const { app, lines } = captureLogs({ db: allowListDb, turns: [{ fail: 'down' }] });
    await app.inject({ method: 'POST', url: '/imports/analyze', headers, payload });
    await app.close();
    expect(lines.find((l) => l.msg === 'import analyze failed')).toMatchObject({
      level: 40,
      error: 'ai_unavailable',
    });
  });

  it('warns when the link budget expires, and when a read throws', async () => {
    const { app, lines } = captureLogs({ db: allowListDb });
    app.get('/slow', async () => {
      await readImportLinks(
        reader({ readAll: () => new Promise(() => undefined) }),
        ['https://a.test/1', 'https://a.test/2'],
        10,
      );
      return {};
    });
    app.get('/boom', async () => {
      await readImportLinks(
        reader({
          readAll: async () => {
            throw new Error('secret');
          },
        }),
        ['https://a.test/1'],
        1000,
      );
      return {};
    });
    await app.inject({ method: 'GET', url: '/slow' });
    await app.inject({ method: 'GET', url: '/boom' });
    await app.close();
    expect(lines.filter((l) => l.msg === 'link budget expired')).toEqual([
      expect.objectContaining({ level: 40, unread: 2 }),
    ]);
    expect(lines.find((l) => l.msg === 'import link read failed')).toMatchObject({ level: 40 });
  });
});

describe('analyzeImport prompt', () => {
  it('is the shared context, the note limit and the import block, with no workspace block', async () => {
    const ai = createFakeAi([{ value: { notes: [] } }]);
    await analyzeImport(ai, reader(), { categories: [] }, input);
    expect(ai.calls[0]?.prompt).toBe(
      [
        'Today: 2026-01-01',
        'UI language: en',
        'Existing taxonomy (category id | category | tags id:name):',
        '(none yet)',
        'At most 200 notes.',
        '<import>\nx\n</import>',
      ].join('\n'),
    );
  });
});
