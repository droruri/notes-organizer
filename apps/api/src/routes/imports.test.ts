import { ImportCreated, ImportProposal, Note, NoteList, Taxonomy } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
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
      { value: { notes: [{ body: 'buy milk', newCategories: ['Home'] }, { body: 'call mom' }] } },
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
    expect(await counts()).toEqual({ notes: 0, categories: 0 });
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
