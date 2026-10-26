import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from './ai/provider';
import type { VerifyToken } from './auth';
import { createPool } from './db';
import { analyzeImport, readImportLinks } from './domain/imports/analyze';
import type { LinkReader } from './domain/links/preview';
import { buildServer } from './server';
import { allowListDb, allowedEmails, fakeVerifyToken } from './test-auth';

type Line = { level: number; msg?: string; [key: string]: unknown };

function capture(
  db: Parameters<typeof buildServer>[0]['db'],
  turns?: Parameters<typeof createFakeAi>[0],
  verifyToken: VerifyToken = fakeVerifyToken,
) {
  const lines: Line[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l));
      cb();
    },
  });
  const app = buildServer({
    db,
    ai: createFakeAi(turns),
    verifyToken,
    allowedEmails,
    logger: { level: 'debug', stream },
  });
  return { app, lines };
}

const reader = (readAll: LinkReader['readAll']): LinkReader => ({
  preview: async () => null,
  read: async (url) => ({ url, ok: true }),
  readAll,
});
const input = { text: 'secret import text', today: '2026-01-01', locale: 'en' as const };

describe('import outcome logs (in a request)', () => {
  it('logs import analyzed with counts and no text', async () => {
    const { app, lines } = capture(allowListDb);
    app.get('/t', async () =>
      analyzeImport(
        createFakeAi([{ value: { notes: [{ body: 'secret import text' }] } }]),
        reader(async (urls) => urls.map((url) => ({ url, ok: true }))),
        { categories: [] },
        input,
      ),
    );
    await app.inject({ method: 'GET', url: '/t' });
    await app.close();
    expect(lines.find((l) => l.msg === 'import analyzed')).toMatchObject({
      level: 30,
      chars: input.text.length,
      notes: 1,
      links: { total: 0, read: 0 },
    });
    expect(JSON.stringify(lines)).not.toContain('secret import text');
  });

  it('warns on ai_unavailable', async () => {
    const { app, lines } = capture(allowListDb);
    app.get('/t', async () =>
      analyzeImport(
        createFakeAi([{ fail: 'down' }]),
        reader(async () => []),
        { categories: [] },
        input,
      ),
    );
    await app.inject({ method: 'GET', url: '/t' });
    await app.close();
    expect(lines.find((l) => l.msg === 'import analyze failed')).toMatchObject({
      level: 40,
      error: 'ai_unavailable',
    });
  });

  it('warns when the link budget expires, and when a read throws', async () => {
    const { app, lines } = capture(allowListDb);
    app.get('/slow', async () => {
      await readImportLinks(
        reader(() => new Promise(() => {})),
        ['https://a.test/1', 'https://a.test/2'],
        10,
      );
      return {};
    });
    app.get('/boom', async () => {
      await readImportLinks(
        reader(async () => {
          throw new Error('secret');
        }),
        ['https://a.test/1'],
        1000,
      );
      return {};
    });
    await app.inject({ method: 'GET', url: '/slow' });
    await app.inject({ method: 'GET', url: '/boom' });
    await app.close();
    expect(lines.find((l) => l.msg === 'link budget expired')).toMatchObject({
      level: 40,
      unread: 2,
    });
    expect(lines.find((l) => l.msg === 'import link read failed')).toMatchObject({ level: 40 });
    expect(lines.filter((l) => l.msg === 'link budget expired')).toHaveLength(1);
  });
});

const databaseUrl = process.env.DATABASE_URL;
const ME = { id: '99999999-9999-4999-8999-999999999999', email: 'outcome-logs@example.com' };
const verifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ME;
  throw new Error('invalid token');
};
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!databaseUrl)('note and import outcome logs against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const headers = { authorization: 'Bearer allowed' };
  const clean = async () => {
    await pool.query('delete from notes where user_id = $1', [ME.id]);
    await pool.query('delete from categories where user_id = $1', [ME.id]);
  };
  beforeAll(async () => {
    await pool.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
       on conflict do nothing`,
      [ME.id, ME.email],
    );
    await clean();
  });
  afterAll(async () => {
    await clean();
    await pool.end();
  });

  it('logs draft saved, draft duplicate, note updated, deleted and restored', async () => {
    const { app, lines } = capture(
      pool,
      [{ value: { body: 'x' } }, { value: { body: 'x' } }],
      verifyToken,
    );
    const payload = {
      body: 'secret note text',
      clientId: crypto.randomUUID(),
      today,
      locale: 'en',
    };
    const first = await app.inject({ method: 'POST', url: '/notes', headers, payload });
    const noteId = first.json().note.id;
    await app.inject({ method: 'POST', url: '/notes', headers, payload });
    await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}`,
      headers,
      payload: { status: 'todo' },
    });
    await app.inject({ method: 'DELETE', url: `/notes/${noteId}`, headers });
    await app.inject({ method: 'POST', url: `/notes/${noteId}/restore`, headers });
    await app.close();
    expect(lines.find((l) => l.msg === 'draft saved')).toMatchObject({
      noteId,
      links: 0,
      categories: 0,
      tags: 0,
      newCategories: 0,
      newTags: 0,
    });
    expect(lines.find((l) => l.msg === 'draft duplicate')).toMatchObject({ noteId });
    expect(lines.find((l) => l.msg === 'note updated')).toMatchObject({
      noteId,
      from: 'draft',
      to: 'todo',
    });
    expect(lines.find((l) => l.msg === 'note deleted')).toMatchObject({ noteId });
    expect(lines.find((l) => l.msg === 'note restored')).toMatchObject({ noteId });
    expect(JSON.stringify(lines)).not.toContain('secret note text');
  });

  it('logs import confirmed counts and the unknown-taxonomy rejection', async () => {
    const { app, lines } = capture(pool, undefined, verifyToken);
    await app.inject({
      method: 'POST',
      url: '/imports/confirm',
      headers,
      payload: { categories: ['Home'], tags: [], notes: [{ body: 'secret note text' }] },
    });
    await app.inject({
      method: 'POST',
      url: '/imports/confirm',
      headers,
      payload: { categories: [], tags: [], notes: [{ body: 'b', newCategories: ['Nope'] }] },
    });
    await app.close();
    expect(lines.find((l) => l.msg === 'import confirmed')).toMatchObject({
      categories: 1,
      tags: 0,
      notes: 1,
    });
    expect(lines.find((l) => l.msg === 'import rejected')).toMatchObject({
      level: 40,
      error: 'unknown_taxonomy',
    });
    expect(JSON.stringify(lines)).not.toContain('secret note text');
  });
});
