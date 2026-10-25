import { Note, NoteCreated, NoteList, Taxonomy } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
import { buildServer } from '../server';

const ME = { id: '66666666-6666-4666-8666-666666666666', email: 'notes-me@example.com' };
const OTHER = { id: '77777777-7777-4777-8777-777777777777', email: 'notes-other@example.com' };
const verifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ME;
  if (token === 'other') return OTHER;
  throw new Error('invalid token');
};

const databaseUrl = process.env.DATABASE_URL;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!databaseUrl)('notes routes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const ai = createFakeAi();
  const app = buildServer({
    db: pool,
    ai,
    verifyToken,
    allowedEmails: new Set([ME.email, OTHER.email]),
  });
  const mine = { authorization: 'Bearer allowed' };
  const theirs = { authorization: 'Bearer other' };

  const send = (headers: typeof mine, method: 'GET' | 'POST' | 'PATCH', url: string, p?: object) =>
    app.inject({ method, url, headers, ...(p ? { payload: p } : {}) });

  const clean = async () => {
    await pool.query('delete from notes where user_id = any($1)', [[ME.id, OTHER.id]]);
    await pool.query('delete from categories where user_id = any($1)', [[ME.id, OTHER.id]]);
  };

  async function category(headers: typeof mine, name: string) {
    const res = await send(headers, 'POST', '/categories', { name });
    return Note.pick({ id: true }).parse(res.json()).id;
  }
  async function draft(body: string, clientId = crypto.randomUUID()) {
    const res = await send(mine, 'POST', '/notes', { body, clientId, today, locale: 'en' });
    return { res, clientId };
  }

  beforeAll(async () => {
    for (const u of [ME, OTHER]) {
      await pool.query(
        `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
         on conflict do nothing`,
        [u.id, u.email],
      );
    }
    await clean();
  });
  afterAll(async () => {
    await clean();
    await app.close();
    await pool.end();
  });

  it('creates a draft with the scripted suggestion, and a repeated clientId returns it', async () => {
    const work = await category(mine, 'Work');
    const raw = {
      categoryIds: [work],
      newCategories: ['Home'],
      dueDate: '2026-12-01',
      urgency: 'urgent',
    };
    const fresh = createFakeAi([{ value: raw }]);
    const app2 = buildServer({
      db: pool,
      ai: fresh,
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });
    const clientId = crypto.randomUUID();
    const payload = { body: 'pay rent', clientId, today, locale: 'en' };
    const first = await app2.inject({ method: 'POST', url: '/notes', headers: mine, payload });
    expect(first.statusCode).toBe(201);
    const created = NoteCreated.parse(first.json());
    expect(created.note.status).toBe('draft');
    expect(created.note.categoryIds).toEqual([work]);
    expect(created.suggestion.newCategories).toEqual(['Home']);
    expect(created.suggestion.dueDate).toBe('2026-12-01');

    const again = await app2.inject({ method: 'POST', url: '/notes', headers: mine, payload });
    expect(again.statusCode).toBe(200);
    expect(NoteCreated.parse(again.json()).note.id).toBe(created.note.id);
    expect(fresh.calls).toHaveLength(1);
    await app2.close();
  });

  it('still creates a draft when the model fails', async () => {
    const { res } = await draft('buy milk');
    expect(res.statusCode).toBe(201);
    expect(NoteCreated.parse(res.json()).suggestion.categoryIds).toEqual([]);
  });

  it('rejects a bad body and a far-off today', async () => {
    const clientId = crypto.randomUUID();
    expect(
      (await send(mine, 'POST', '/notes', { body: '', clientId, today, locale: 'en' })).statusCode,
    ).toBe(400);
    const res = await send(mine, 'POST', '/notes', {
      body: 'x',
      clientId,
      today: '2000-01-01',
      locale: 'en',
    });
    expect(res.statusCode).toBe(400);
  });

  it('submits in one transaction: creates new taxonomy, links, clears proposed', async () => {
    const { res } = await draft('plan trip');
    const id = NoteCreated.parse(res.json()).note.id;
    const submit = await send(mine, 'PATCH', `/notes/${id}`, {
      status: 'todo',
      newCategories: ['Travel'],
      newTags: [{ categoryName: 'Travel', name: 'Flights' }],
      importance: 'important',
      dueDate: '2026-12-24',
    });
    expect(submit.statusCode).toBe(200);
    const note = Note.parse(submit.json());
    expect(note).toMatchObject({
      status: 'todo',
      proposed: null,
      importance: 'important',
      dueDate: '2026-12-24',
    });
    expect(note.categoryIds).toHaveLength(1);
    expect(note.tagIds).toHaveLength(1);
    const tax = Taxonomy.parse((await send(mine, 'GET', '/taxonomy')).json());
    expect(tax.categories.find((c) => c.name === 'Travel')?.tags.map((t) => t.name)).toEqual([
      'Flights',
    ]);

    const list = NoteList.parse((await send(mine, 'GET', '/notes')).json());
    expect(list.some((n) => n.id === id)).toBe(true);
    expect(NoteList.parse((await send(theirs, 'GET', '/notes')).json())).toEqual([]);
  });

  it('rolls back everything when a submit has an unknown reference', async () => {
    const { res } = await draft('rollback me');
    const id = NoteCreated.parse(res.json()).note.id;
    const bad = await send(mine, 'PATCH', `/notes/${id}`, {
      status: 'todo',
      newCategories: ['Ghosts'],
      newTags: [{ categoryName: 'Nowhere', name: 'x' }],
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: 'unknown_taxonomy' });
    const tax = Taxonomy.parse((await send(mine, 'GET', '/taxonomy')).json());
    expect(tax.categories.some((c) => c.name === 'Ghosts')).toBe(false);
    const note = NoteList.parse((await send(mine, 'GET', '/notes')).json()).find(
      (n) => n.id === id,
    );
    expect(note?.status).toBe('draft');
  });

  it('answers 422 invalid_transition for a draft jumped to done', async () => {
    const { res } = await draft('jump');
    const id = NoteCreated.parse(res.json()).note.id;
    const bad = await send(mine, 'PATCH', `/notes/${id}`, { status: 'done' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: 'invalid_transition' });
  });

  it('answers 422 unknown_taxonomy for another user’s ids and 404 for another user’s note', async () => {
    const theirCategory = await category(theirs, 'Secret');
    const { res } = await draft('mine');
    const id = NoteCreated.parse(res.json()).note.id;
    const bad = await send(mine, 'PATCH', `/notes/${id}`, { categoryIds: [theirCategory] });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: 'unknown_taxonomy' });
    expect((await send(theirs, 'PATCH', `/notes/${id}`, { body: 'hijack' })).statusCode).toBe(404);
  });
});
