import { randomUUID } from 'node:crypto';
import { ActionsResponse, Category, CategoryColor, Tag, Taxonomy } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import { createPool } from '../db';
import { buildServer } from '../server';
import { captureLogs } from '../test-logs';
import type { VerifyToken } from '../auth';

// Own users, so these tests don't race the settings tests that delete ALLOWED_USER.
const ALLOWED_USER = { id: '44444444-4444-4444-4444-444444444444', email: 'tax-me@example.com' };
const OTHER_USER = { id: '55555555-5555-5555-5555-555555555555', email: 'tax-other@example.com' };
const fakeVerifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ALLOWED_USER;
  if (token === 'other') return OTHER_USER;
  throw new Error('invalid token');
};
const allowedEmails = new Set([ALLOWED_USER.email]);

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('taxonomy routes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const app = buildServer({
    db: pool,
    ai: createFakeAi(),
    verifyToken: fakeVerifyToken,
    allowedEmails: new Set([...allowedEmails, OTHER_USER.email]),
  });
  const mine = { authorization: 'Bearer allowed' };
  const theirs = { authorization: 'Bearer other' };

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, headers: mine, ...(payload ? { payload } : {}) });
  const as = (
    headers: typeof mine,
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    p?: object,
  ) => app.inject({ method, url, headers, ...(p ? { payload: p } : {}) });

  async function newCategory(name: string) {
    const res = await call('POST', '/categories', { name });
    expect(res.statusCode).toBe(201);
    return Category.parse(res.json());
  }
  async function newTag(categoryId: string, name: string) {
    const res = await call('POST', `/categories/${categoryId}/tags`, { name });
    expect(res.statusCode).toBe(201);
    return Tag.parse(res.json());
  }

  const clean = () =>
    pool.query('delete from categories where user_id = any($1)', [
      [ALLOWED_USER.id, OTHER_USER.id],
    ]);

  beforeAll(async () => {
    for (const u of [ALLOWED_USER, OTHER_USER]) {
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
    await pool.query('delete from auth.users where id = any($1)', [
      [ALLOWED_USER.id, OTHER_USER.id],
    ]);
    await app.close();
    await pool.end();
  });

  it('creates a category, normalizing the name, and lists it with its tags', async () => {
    const cat = await newCategory('  Home   projects ');
    expect(cat).toMatchObject({ name: 'Home projects', deleted: false });
    const tag = await newTag(cat.id, 'Garden');
    const taxonomy = Taxonomy.parse((await call('GET', '/taxonomy')).json());
    expect(taxonomy.categories.find((c) => c.id === cat.id)?.tags).toEqual([tag]);
  });

  it('gives new categories different colors and reuses a color freed by a delete', async () => {
    const [a, b, c] = [
      await newCategory('Col A'),
      await newCategory('Col B'),
      await newCategory('Col C'),
    ];
    expect(new Set([a.color, b.color, c.color]).size).toBe(3);
    expect((await call('DELETE', `/categories/${b.id}`)).statusCode).toBe(204);
    const used = new Set(
      Taxonomy.parse((await call('GET', '/taxonomy')).json())
        .categories.filter((x) => !x.deleted)
        .map((x) => x.color),
    );
    const palette = CategoryColor.options.filter((k) => !used.has(k));
    const d = await newCategory('Col D');
    // Other test files share this user, so the freed color is only guaranteed to be picked when
    // it is the first unused palette entry: assert the rule, and that the freed color is eligible.
    expect(palette).toContain(b.color);
    expect(palette[0]).toBe(d.color);
    const listed = Taxonomy.parse((await call('GET', '/taxonomy')).json());
    expect(listed.categories.find((x) => x.id === d.id)?.color).toBe(d.color);
  });

  it('gives concurrently created categories different colors', async () => {
    const made = await Promise.all(['Par A', 'Par B', 'Par C'].map((n) => newCategory(n)));
    expect(new Set(made.map((c) => c.color)).size).toBe(3);
  });

  it('rejects empty names and malformed bodies with 400', async () => {
    expect((await call('POST', '/categories', { name: '   ' })).statusCode).toBe(400);
    expect((await call('POST', '/categories', { nope: 1 })).statusCode).toBe(400);
  });

  it('409 name_taken on a duplicate active name, ignoring case; rename conflicts too', async () => {
    const a = await newCategory('Dup');
    const dup = await call('POST', '/categories', { name: 'dUP' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toEqual({ error: 'name_taken' });
    const b = await newCategory('Dup other');
    expect((await call('PATCH', `/categories/${b.id}`, { name: 'DUP' })).statusCode).toBe(409);
    const renamed = await call('PATCH', `/categories/${a.id}`, { name: 'Dup renamed' });
    expect(renamed.statusCode).toBe(200);
    expect(Category.parse(renamed.json()).name).toBe('Dup renamed');
  });

  it('soft-deletes a category (still listed, flagged), frees the name, and restores it', async () => {
    const cat = await newCategory('Ephemeral');
    expect((await call('DELETE', `/categories/${cat.id}`)).statusCode).toBe(204);
    const listed = Taxonomy.parse((await call('GET', '/taxonomy')).json());
    expect(listed.categories.find((c) => c.id === cat.id)?.deleted).toBe(true);
    const reused = await newCategory('ephemeral');
    // Restoring collides with the active category that took the name.
    const conflict = await call('POST', `/categories/${cat.id}/restore`);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: 'name_taken' });
    await call('DELETE', `/categories/${reused.id}`);
    const restored = await call('POST', `/categories/${cat.id}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(Category.parse(restored.json()).deleted).toBe(false);
  });

  it('tags: duplicate names are per category; rename, delete and restore work', async () => {
    const one = await newCategory('Tags one');
    const two = await newCategory('Tags two');
    const tag = await newTag(one.id, 'Urgent');
    await newTag(two.id, 'urgent');
    const dup = await call('POST', `/categories/${one.id}/tags`, { name: 'URGENT' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toEqual({ error: 'name_taken' });
    const renamed = await call('PATCH', `/tags/${tag.id}`, { name: 'Later' });
    expect(Tag.parse(renamed.json()).name).toBe('Later');
    expect((await call('DELETE', `/tags/${tag.id}`)).statusCode).toBe(204);
    const again = await newTag(one.id, 'Later');
    const conflict = await call('POST', `/tags/${tag.id}/restore`);
    expect(conflict.statusCode).toBe(409);
    await call('DELETE', `/tags/${again.id}`);
    const restored = await call('POST', `/tags/${tag.id}/restore`);
    expect(Tag.parse(restored.json()).deleted).toBe(false);
  });

  it('422 category_deleted when adding or restoring a tag under a deleted category', async () => {
    const cat = await newCategory('Gone');
    const tag = await newTag(cat.id, 'Child');
    await call('DELETE', `/tags/${tag.id}`);
    await call('DELETE', `/categories/${cat.id}`);
    const add = await call('POST', `/categories/${cat.id}/tags`, { name: 'New' });
    expect(add.statusCode).toBe(422);
    expect(add.json()).toEqual({ error: 'category_deleted' });
    const restore = await call('POST', `/tags/${tag.id}/restore`);
    expect(restore.statusCode).toBe(422);
    expect(restore.json()).toEqual({ error: 'category_deleted' });
    await call('POST', `/categories/${cat.id}/restore`);
    expect((await call('POST', `/tags/${tag.id}/restore`)).statusCode).toBe(200);
  });

  it("another user's ids behave as not found, and their taxonomy is not listed", async () => {
    const cat = await newCategory('Private');
    const tag = await newTag(cat.id, 'Secret');
    const attempts: [typeof mine, 'POST' | 'PATCH' | 'DELETE', string, object?][] = [
      [theirs, 'PATCH', `/categories/${cat.id}`, { name: 'x' }],
      [theirs, 'DELETE', `/categories/${cat.id}`],
      [theirs, 'POST', `/categories/${cat.id}/restore`],
      [theirs, 'POST', `/categories/${cat.id}/tags`, { name: 'x' }],
      [theirs, 'PATCH', `/tags/${tag.id}`, { name: 'x' }],
      [theirs, 'DELETE', `/tags/${tag.id}`],
      [theirs, 'POST', `/tags/${tag.id}/restore`],
    ];
    for (const [headers, method, url, payload] of attempts) {
      const res = await as(headers, method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    const listed = await app.inject({ method: 'GET', url: '/taxonomy', headers: theirs });
    expect(Taxonomy.parse(listed.json()).categories).toEqual([]);
    expect((await call('PATCH', '/categories/not-a-uuid', { name: 'x' })).statusCode).toBe(404);
  });
  describe('POST /taxonomy/actions', () => {
    const batch = (headers: typeof mine, body: object) =>
      app.inject({ method: 'POST', url: '/taxonomy/actions', headers, payload: body });
    const create = (name: string) => ({ action: 'create', kind: 'category', name });

    it('keeps going past a failed action', async () => {
      const taken = await newCategory(`batch-${randomUUID()}`);
      const [a, c] = [`a-${randomUUID()}`, `c-${randomUUID()}`];
      const res = await batch(mine, { actions: [create(a), create(taken.name), create(c)] });
      expect(res.statusCode).toBe(200);
      expect(ActionsResponse.parse(res.json()).results).toEqual([
        { ok: true },
        { ok: false, error: 'name_taken' },
        { ok: true },
      ]);
      const names = Taxonomy.parse((await call('GET', '/taxonomy')).json()).categories.map(
        (x) => x.name,
      );
      expect(names).toEqual(expect.arrayContaining([a, c]));
    });

    it('applies in order: delete then restore leaves the tag active', async () => {
      const cat = await newCategory(`ord-${randomUUID()}`);
      const tag = Tag.parse(
        (await call('POST', `/categories/${cat.id}/tags`, { name: 't' })).json(),
      );
      const res = await batch(mine, {
        actions: [
          { action: 'delete', kind: 'tag', id: tag.id, name: 't' },
          { action: 'restore', kind: 'tag', id: tag.id, name: 't' },
        ],
      });
      expect(res.json()).toEqual({ results: [{ ok: true }, { ok: true }] });
      const got = Taxonomy.parse((await call('GET', '/taxonomy')).json());
      const found = got.categories.find((x) => x.id === cat.id)?.tags.find((x) => x.id === tag.id);
      expect(found?.deleted).toBe(false);
    });

    it("gives not_found for another user's id", async () => {
      const cat = await newCategory(`own-${randomUUID()}`);
      const res = await batch(theirs, {
        actions: [{ action: 'delete', kind: 'category', id: cat.id, name: cat.name }],
      });
      expect(res.json()).toEqual({ results: [{ ok: false, error: 'not_found' }] });
    });

    it('rejects an empty list, 21 actions and a malformed body', async () => {
      const bodies = [
        { actions: [] },
        { actions: Array.from({ length: 21 }, () => create('x')) },
        { nope: 1 },
      ];
      for (const body of bodies) {
        const res = await batch(mine, body);
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'invalid_body' });
      }
    });
  });

  describe('PUT /categories/:id/importance', () => {
    const put = (id: string, payload: object, headers = mine) =>
      as(headers, 'PUT', `/categories/${id}/importance`, payload);

    it('sets, changes and clears the level; GET /taxonomy shows it; works on deleted categories', async () => {
      const cat = await newCategory(`imp-${randomUUID()}`);
      expect(cat.importance).toBeNull();
      const levels = ['important', 'not_important', null] as const;
      for (const importance of levels) {
        const res = await put(cat.id, { importance });
        expect(res.statusCode).toBe(200);
        expect(Category.parse(res.json()).importance).toBe(importance);
        const listed = Taxonomy.parse((await call('GET', '/taxonomy')).json());
        expect(listed.categories.find((c) => c.id === cat.id)?.importance).toBe(importance);
      }
      await call('DELETE', `/categories/${cat.id}`);
      const res = await put(cat.id, { importance: 'important' });
      expect(res.statusCode).toBe(200);
      expect(Category.parse(res.json())).toMatchObject({
        deleted: true,
        importance: 'important',
      });
    });

    it("404s for another user's category and leaves it untouched", async () => {
      const cat = await newCategory(`imp-own-${randomUUID()}`);
      const res = await put(cat.id, { importance: 'important' }, theirs);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
      const listed = Taxonomy.parse((await call('GET', '/taxonomy')).json());
      expect(listed.categories.find((c) => c.id === cat.id)?.importance).toBeNull();
    });

    it('400s on a bad body', async () => {
      const cat = await newCategory(`imp-bad-${randomUUID()}`);
      for (const body of [{ importance: 'urgent' }, {}, { importance: 1 }]) {
        const res = await put(cat.id, body);
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'invalid_body' });
      }
    });

    it('logs the outcome and the not-found warning', async () => {
      const { app: logged, lines } = captureLogs({
        db: pool,
        verifyToken: fakeVerifyToken,
        allowedEmails: new Set([ALLOWED_USER.email, OTHER_USER.email]),
      });
      const cat = await newCategory(`imp-log-${randomUUID()}`);
      const send = (id: string, headers: typeof mine) =>
        logged.inject({
          method: 'PUT',
          url: `/categories/${id}/importance`,
          headers,
          payload: { importance: 'important' },
        });
      expect((await send(cat.id, mine)).statusCode).toBe(200);
      expect(lines.find((l) => l.msg === 'category importance set')).toMatchObject({
        level: 30,
        categoryId: cat.id,
        importance: 'important',
      });
      expect((await send(cat.id, theirs)).statusCode).toBe(404);
      expect(lines.find((l) => l.msg === 'category importance failed')).toMatchObject({
        level: 40,
        categoryId: cat.id,
        error: 'not_found',
      });
      await logged.close();
    });
  });

  describe('PUT /categories/:id/color', () => {
    const put = (id: string, payload: object, headers = mine) =>
      as(headers, 'PUT', `/categories/${id}/color`, payload);

    it('sets the color; GET /taxonomy shows it; works on deleted categories', async () => {
      const cat = await newCategory(`col-${randomUUID()}`);
      const target = cat.color === 'pink' ? 'teal' : 'pink';
      const res = await put(cat.id, { color: target });
      expect(res.statusCode).toBe(200);
      expect(Category.parse(res.json()).color).toBe(target);
      const listed = Taxonomy.parse((await call('GET', '/taxonomy')).json());
      expect(listed.categories.find((c) => c.id === cat.id)?.color).toBe(target);
      await call('DELETE', `/categories/${cat.id}`);
      const again = await put(cat.id, { color: 'red' });
      expect(again.statusCode).toBe(200);
      expect(Category.parse(again.json())).toMatchObject({ deleted: true, color: 'red' });
    });

    it("404s for another user's category and leaves it untouched", async () => {
      const cat = await newCategory(`col-own-${randomUUID()}`);
      const res = await put(cat.id, { color: 'red' }, theirs);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'not_found' });
      const listed = Taxonomy.parse((await call('GET', '/taxonomy')).json());
      expect(listed.categories.find((c) => c.id === cat.id)?.color).toBe(cat.color);
    });

    it('400s on a bad body', async () => {
      const cat = await newCategory(`col-bad-${randomUUID()}`);
      for (const body of [{ color: 'yellow' }, {}, { color: 1 }]) {
        const res = await put(cat.id, body);
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'invalid_body' });
      }
    });

    it('logs the outcome and the not-found warning', async () => {
      const { app: logged, lines } = captureLogs({
        db: pool,
        verifyToken: fakeVerifyToken,
        allowedEmails: new Set([ALLOWED_USER.email, OTHER_USER.email]),
      });
      const cat = await newCategory(`col-log-${randomUUID()}`);
      const send = (headers: typeof mine) =>
        logged.inject({
          method: 'PUT',
          url: `/categories/${cat.id}/color`,
          headers,
          payload: { color: 'red' },
        });
      expect((await send(mine)).statusCode).toBe(200);
      expect(lines.find((l) => l.msg === 'category color set')).toMatchObject({
        level: 30,
        categoryId: cat.id,
        color: 'red',
      });
      expect((await send(theirs)).statusCode).toBe(404);
      expect(lines.find((l) => l.msg === 'category color failed')).toMatchObject({
        level: 40,
        categoryId: cat.id,
        error: 'not_found',
      });
      await logged.close();
    });
  });
});
