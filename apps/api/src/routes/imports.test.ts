import { ImportCreated, ImportProposal, Note, NoteList, Taxonomy } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
import { captureLogs } from '../test-logs';
import { buildServer } from '../server';

const ME = { id: '88888888-8888-4888-8888-888888888888', email: 'imports-me@example.com' };
const verifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ME;
  throw new Error('invalid token');
};

const databaseUrl = process.env.DATABASE_URL;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!databaseUrl)('imports routes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const headers = { authorization: 'Bearer allowed' };
  const serverWith = (turns: Parameters<typeof createFakeAi>[0]) =>
    buildServer({
      db: pool,
      ai: createFakeAi(turns),
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });

  const clean = async () => {
    await pool.query('delete from notes where user_id = $1', [ME.id]);
    await pool.query('delete from categories where user_id = $1', [ME.id]);
  };
  const counts = async () => {
    const n = await pool.query('select count(*)::int as n from notes where user_id = $1', [ME.id]);
    const c = await pool.query('select count(*)::int as n from categories where user_id = $1', [
      ME.id,
    ]);
    return { notes: n.rows[0].n as number, categories: c.rows[0].n as number };
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

  it('analyze returns a proposal and writes nothing', async () => {
    const app = serverWith([
      {
        value: {
          notes: [
            { body: 'buy milk', title: 'Milk', newCategories: ['Home'] },
            { body: 'call mom' },
          ],
        },
      },
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/imports/analyze',
      headers,
      payload: { text: 'buy milk, call mom', today, locale: 'en' },
    });
    expect(res.statusCode).toBe(200);
    const proposal = ImportProposal.parse(res.json());
    expect(proposal.notes).toHaveLength(2);
    expect(proposal.newCategories).toEqual(['Home']);
    expect(proposal.notes.map((n) => n.suggestion.title)).toEqual(['Milk', null]);
    expect(await counts()).toEqual({ notes: 0, categories: 0 });
    await app.close();
  });

  it('analyze rows inherit category importance', async () => {
    const cat = await pool.query(
      `insert into categories (user_id, name, importance) values ($1, 'Vital', 'important') returning id`,
      [ME.id],
    );
    const app = serverWith([{ value: { notes: [{ body: 'a', categoryIds: [cat.rows[0].id] }] } }]);
    const res = await app.inject({
      method: 'POST',
      url: '/imports/analyze',
      headers,
      payload: { text: 'a', today, locale: 'en' },
    });
    const proposal = ImportProposal.parse(res.json());
    expect(proposal.notes[0]?.suggestion.importance).toBe('important');
    await app.close();
  });

  it('rejects text over 50 000 characters', async () => {
    const app = serverWith([]);
    const res = await app.inject({
      method: 'POST',
      url: '/imports/analyze',
      headers,
      payload: { text: 'a'.repeat(50_001), today, locale: 'en' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('confirm creates taxonomy and todo notes with unread links', async () => {
    await clean();
    const app = serverWith([]);
    const res = await app.inject({
      method: 'POST',
      url: '/imports/confirm',
      headers,
      payload: {
        categories: ['Home'],
        tags: [{ categoryName: 'Home', name: 'Chores' }],
        notes: [
          {
            body: 'wash up https://x.test/a',
            title: 'Wash up',
            newCategories: ['Home'],
            newTags: [{ categoryName: 'Home', name: 'Chores' }],
            unreadLinks: ['https://x.test/a'],
          },
          { body: 'plain' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(ImportCreated.parse(res.json()).created).toEqual({ categories: 1, tags: 1, notes: 2 });
    const notes = NoteList.parse(
      (await app.inject({ method: 'GET', url: '/notes', headers })).json(),
    );
    const wash = notes.find((n) => n.body.startsWith('wash up'));
    expect(wash?.status).toBe('todo');
    expect(wash?.title).toBe('Wash up');
    expect(wash?.unreadLinks).toEqual(['https://x.test/a']);
    expect(wash?.categoryIds).toHaveLength(1);
    expect(wash?.tagIds).toHaveLength(1);
    const taxonomy = Taxonomy.parse(
      (await app.inject({ method: 'GET', url: '/taxonomy', headers })).json(),
    );
    expect(taxonomy.categories.map((c) => c.name)).toEqual(['Home']);
    Note.array().parse(notes);
    await app.close();
  });

  it('confirm puts every note in an owned workspace, and a foreign one falls back to the default', async () => {
    await clean();
    const OTHER = '99999999-9999-4999-8999-999999999990';
    await pool.query(
      `insert into auth.users (id, email, aud, role) values ($1, 'imports-other@example.com', 'authenticated', 'authenticated')
       on conflict do nothing`,
      [OTHER],
    );
    const app = serverWith([]);
    await app.inject({ method: 'GET', url: '/workspaces', headers });
    const mine = await pool.query(
      `insert into workspaces (user_id, name) values ($1, 'Import target') returning id`,
      [ME.id],
    );
    await pool.query('delete from workspaces where user_id = $1', [OTHER]);
    const theirs = await pool.query(
      `insert into workspaces (user_id, name, is_default) values ($1, 'Theirs', true) returning id`,
      [OTHER],
    );
    const def = await pool.query('select id from workspaces where user_id = $1 and is_default', [
      ME.id,
    ]);
    const where = async () =>
      (
        await pool.query('select distinct workspace_id from notes where user_id = $1', [ME.id])
      ).rows.map((r) => r.workspace_id);
    const confirm = (workspaceId?: string) =>
      app.inject({
        method: 'POST',
        url: '/imports/confirm',
        headers,
        payload: {
          ...(workspaceId ? { workspaceId } : {}),
          categories: [],
          tags: [],
          notes: [{ body: 'a' }, { body: 'b' }],
        },
      });
    expect((await confirm(mine.rows[0].id)).statusCode).toBe(200);
    expect(await where()).toEqual([mine.rows[0].id]);
    await clean();
    expect((await confirm(theirs.rows[0].id)).statusCode).toBe(200);
    expect(await where()).toEqual([def.rows[0].id]);
    await clean();
    await pool.query('delete from workspaces where id = $1', [mine.rows[0].id]);
    await pool.query('delete from workspaces where user_id = $1', [OTHER]);
    await app.close();
  });

  it('confirm is all or nothing when one note is invalid', async () => {
    await clean();
    const app = serverWith([]);
    const res = await app.inject({
      method: 'POST',
      url: '/imports/confirm',
      headers,
      payload: {
        categories: ['Work'],
        tags: [],
        notes: [
          { body: 'fine', newCategories: ['Work'] },
          { body: 'bad', categoryIds: ['99999999-9999-4999-8999-999999999999'] },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(await counts()).toEqual({ notes: 0, categories: 0 });
    await app.close();
  });

  it('confirm rejects more than 200 notes', async () => {
    const app = serverWith([]);
    const res = await app.inject({
      method: 'POST',
      url: '/imports/confirm',
      headers,
      payload: {
        categories: [],
        tags: [],
        notes: Array.from({ length: 201 }, () => ({ body: 'x' })),
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe.skipIf(!databaseUrl)('imports outcome logs against the local stack', () => {
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

  it('logs import confirmed counts and the unknown-taxonomy rejection', async () => {
    const { app, lines } = captureLogs({
      db: pool,
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });
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
    const def = await pool.query('select id from workspaces where user_id = $1 and is_default', [
      ME.id,
    ]);
    expect(lines.find((l) => l.msg === 'import confirmed')).toMatchObject({
      categories: 1,
      tags: 0,
      notes: 1,
      workspaceId: def.rows[0].id,
    });
    expect(lines.find((l) => l.msg === 'import rejected')).toMatchObject({
      level: 40,
      error: 'unknown_taxonomy',
    });
    expect(JSON.stringify(lines)).not.toContain('secret note text');
  });
});
