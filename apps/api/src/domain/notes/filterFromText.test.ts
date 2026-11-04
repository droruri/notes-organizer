import { EMPTY_FILTER, type Taxonomy } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../../ai/provider';
import { captureLogs } from '../../test-logs';
import { allowListDb } from '../../test-auth';
import { filterFromText } from './filterFromText';

const C1 = '11111111-1111-4111-8111-111111111111';
const T1 = '33333333-3333-4333-8333-333333333333';
const GONE = '99999999-9999-4999-8999-999999999999';
const taxonomy: Taxonomy = {
  categories: [
    {
      id: C1,
      name: 'Work',
      deleted: false,
      importance: null,
      color: 'slate',
      tags: [{ id: T1, categoryId: C1, name: 'Urgent', deleted: false }],
    },
  ],
};
const input = { text: 'secret sentence', today: '2026-11-04', locale: 'en' as const, taxonomy };

describe('filterFromText', () => {
  it('keeps known ids and valid dates, merged over the empty filter', async () => {
    const ai = createFakeAi([
      { value: { categoryIds: [C1], createdFrom: '2026-10-01', createdTo: '2026-10-31' } },
    ]);
    const result = await filterFromText(ai, input);
    expect(result).toEqual({
      ok: true,
      value: {
        ...EMPTY_FILTER,
        categoryIds: [C1],
        createdFrom: '2026-10-01',
        createdTo: '2026-10-31',
      },
    });
    expect(ai.calls[0]?.prompt).toContain('Today: 2026-11-04');
    expect(ai.calls[0]?.prompt).toContain(C1);
  });

  it('drops unknown ids and a malformed date, keeps keywords in text', async () => {
    const ai = createFakeAi([
      { value: { categoryIds: [GONE], tagIds: [T1], createdFrom: 'last week', text: ' rent ' } },
    ]);
    const result = await filterFromText(ai, input);
    expect(result).toEqual({
      ok: true,
      value: { ...EMPTY_FILTER, tagIds: [T1], text: 'rent' },
    });
  });

  it('fails with ai_unavailable when the model fails', async () => {
    const result = await filterFromText(createFakeAi([{ fail: 'down' }]), input);
    expect(result).toEqual({ ok: false, error: 'ai_unavailable' });
  });
});

describe('POST /notes/filter-from-text', () => {
  const headers = { authorization: 'Bearer allowed' };
  const payload = {
    text: 'secret sentence',
    today: new Date().toISOString().slice(0, 10),
    locale: 'en',
  };
  const post = (app: ReturnType<typeof captureLogs>['app'], body: unknown) =>
    app.inject({
      method: 'POST',
      url: '/notes/filter-from-text',
      headers,
      payload: body as object,
    });

  it('logs the outcome with dropped ids and never the sentence', async () => {
    const { app, lines } = captureLogs({
      db: allowListDb,
      turns: [{ value: { categoryIds: [GONE], text: 'rent' } }],
    });
    const res = await post(app, payload);
    await app.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ filter: { ...EMPTY_FILTER, text: 'rent' } });
    expect(lines.find((l) => l.msg === 'filter from text')).toMatchObject({
      level: 30,
      fields: ['text'],
      droppedIds: 1,
    });
    expect(JSON.stringify(lines)).not.toContain('secret sentence');
  });

  it('answers 503 and warns when the model fails', async () => {
    const { app, lines } = captureLogs({ db: allowListDb, turns: [{ fail: 'down' }] });
    const res = await post(app, payload);
    await app.close();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'ai_unavailable' });
    expect(lines.find((l) => l.msg === 'filter from text failed')).toMatchObject({
      level: 40,
      error: 'ai_unavailable',
    });
    expect(JSON.stringify(lines)).not.toContain('secret sentence');
  });

  it('rejects over-limit text, empty text and an implausible today', async () => {
    const { app } = captureLogs({ db: allowListDb });
    expect((await post(app, { ...payload, text: 'x'.repeat(301) })).statusCode).toBe(400);
    expect((await post(app, { ...payload, text: '   ' })).statusCode).toBe(400);
    const bad = await post(app, { ...payload, today: '1999-01-01' });
    await app.close();
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_today' });
  });

  it('rate limits after 30 requests a minute', async () => {
    const { app } = captureLogs({ db: allowListDb });
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await post(app, payload)).statusCode);
    await app.close();
    expect(codes.at(-1)).toBe(429);
  });
});
