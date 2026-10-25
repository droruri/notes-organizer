import { Category, Tag, Taxonomy } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createPool } from '../db';
import { buildServer } from '../server';
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
    verifyToken: fakeVerifyToken,
    allowedEmails: new Set([...allowedEmails, OTHER_USER.email]),
  });
  const mine = { authorization: 'Bearer allowed' };
  const theirs = { authorization: 'Bearer other' };

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: mine, ...(payload ? { payload } : {}) });
  const as = (headers: typeof mine, method: 'POST' | 'PATCH' | 'DELETE', url: string, p?: object) =>
    app.inject({ method, url, headers, ...(p ? { payload: p } : {}) });

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
});
