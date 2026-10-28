import { AllowedUserList, Me, NoteList } from '@notes/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
import { buildServer } from '../server';

const ADMIN = { id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'users-admin@example.com' };
const ADMIN2 = { id: 'aaaaaaaa-0000-4000-8000-000000000002', email: 'users-admin2@example.com' };
const MEMBER = { id: 'aaaaaaaa-0000-4000-8000-000000000003', email: 'users-member@example.com' };
const NEWBIE = { id: 'aaaaaaaa-0000-4000-8000-000000000004', email: 'users-newbie@example.com' };
const people = { admin: ADMIN, admin2: ADMIN2, member: MEMBER, newbie: NEWBIE };
const verifyToken: VerifyToken = async (token) => {
  const user = people[token as keyof typeof people];
  if (!user) throw new Error('invalid token');
  return user;
};
const as = (who: keyof typeof people) => ({ authorization: `Bearer ${who}` });

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('/users routes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const app = buildServer({
    db: pool,
    ai: createFakeAi(),
    verifyToken,
    allowedEmails: new Set([ADMIN.email]),
  });
  const emails = Object.values(people).map((p) => p.email);

  const call = (
    who: keyof typeof people,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, headers: as(who), ...(payload ? { payload } : {}) });

  // The user from ADMIN2's row on is set up per test, so tests do not depend on each other.
  beforeEach(async () => {
    await pool.query('delete from allowed_users where email = any($1)', [emails]);
    await pool.query(
      `insert into allowed_users (email, is_admin) values ($1, true), ($2, true), ($3, false)`,
      [ADMIN.email, ADMIN2.email, MEMBER.email],
    );
  });

  beforeAll(async () => {
    for (const u of Object.values(people)) {
      await pool.query(
        `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
         on conflict do nothing`,
        [u.id, u.email],
      );
    }
    await pool.query('delete from notes where user_id = any($1)', [
      Object.values(people).map((p) => p.id),
    ]);
  });
  afterAll(async () => {
    await pool.query('delete from notes where user_id = any($1)', [
      Object.values(people).map((p) => p.id),
    ]);
    await pool.query('delete from allowed_users where email = any($1)', [emails]);
    await pool.query('delete from auth.users where id = any($1)', [
      Object.values(people).map((p) => p.id),
    ]);
    await app.close();
    await pool.end();
  });

  it('blocks an email that is not on the list', async () => {
    const res = await call('newbie', 'GET', '/settings');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'not_allowed' });
  });

  it('seeds ALLOWED_EMAILS as admins without demoting or removing anyone', async () => {
    await pool.query('update allowed_users set is_admin = false where email = $1', [ADMIN.email]);
    const second = buildServer({
      db: pool,
      ai: createFakeAi(),
      verifyToken,
      allowedEmails: new Set([ADMIN.email, 'users-seeded@example.com']),
    });
    await second.ready();
    const { rows } = await pool.query<{ email: string; is_admin: boolean }>(
      'select email, is_admin from allowed_users where email = any($1)',
      [[ADMIN.email, MEMBER.email, 'users-seeded@example.com']],
    );
    const byEmail = Object.fromEntries(rows.map((r) => [r.email, r.is_admin]));
    expect(byEmail).toEqual({
      [ADMIN.email]: false, // existing row left alone
      [MEMBER.email]: false,
      'users-seeded@example.com': true,
    });
    await pool.query('delete from allowed_users where email = $1', ['users-seeded@example.com']);
    await second.close();
  });

  it('GET /me reports the role', async () => {
    expect(Me.parse((await call('admin', 'GET', '/me')).json())).toEqual({
      email: ADMIN.email,
      isAdmin: true,
    });
    expect(Me.parse((await call('member', 'GET', '/me')).json()).isAdmin).toBe(false);
  });

  it('403 not_admin on every /users route for a non-admin', async () => {
    const calls: ['GET' | 'POST' | 'PATCH' | 'DELETE', string, object?][] = [
      ['GET', '/users'],
      ['POST', '/users', { email: NEWBIE.email }],
      ['PATCH', `/users/${ADMIN.email}`, { isAdmin: false }],
      ['DELETE', `/users/${ADMIN.email}`],
    ];
    for (const [method, url, payload] of calls) {
      const res = await call('member', method, url, payload);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'not_admin' });
    }
  });

  it('lists emails and roles only', async () => {
    const res = await call('admin', 'GET', '/users');
    expect(res.statusCode).toBe(200);
    const list = AllowedUserList.parse(res.json());
    expect(list.find((u) => u.email === MEMBER.email)).toMatchObject({ isAdmin: false });
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(['createdAt', 'email', 'isAdmin']);
  });

  it('adds a user, who can sign in at once; removing blocks on the next request', async () => {
    expect((await call('newbie', 'GET', '/settings')).statusCode).toBe(403);
    const add = await call('admin', 'POST', '/users', {
      email: `  ${NEWBIE.email.toUpperCase()} `,
    });
    expect(add.statusCode).toBe(201);
    expect(add.json()).toMatchObject({ email: NEWBIE.email, isAdmin: false });
    expect((await call('newbie', 'GET', '/settings')).statusCode).toBe(200);

    const del = await call('admin', 'DELETE', `/users/${encodeURIComponent(NEWBIE.email)}`);
    expect(del.statusCode).toBe(204);
    const after = await call('newbie', 'GET', '/settings');
    expect(after.statusCode).toBe(403);
    expect(after.json()).toEqual({ error: 'not_allowed' });
  });

  it('422 for an invalid email, 409 exists for a duplicate', async () => {
    expect((await call('admin', 'POST', '/users', { email: 'nope' })).statusCode).toBe(422);
    const dup = await call('admin', 'POST', '/users', { email: MEMBER.email.toUpperCase() });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toEqual({ error: 'exists' });
  });

  it('changes a role', async () => {
    const res = await call('admin', 'PATCH', `/users/${MEMBER.email}`, { isAdmin: true });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: MEMBER.email, isAdmin: true });
    expect((await call('member', 'GET', '/users')).statusCode).toBe(200);
  });

  it('404 for an unknown email', async () => {
    expect((await call('admin', 'DELETE', '/users/ghost@example.com')).statusCode).toBe(404);
  });

  it('422 when an admin removes or demotes themself', async () => {
    const demote = await call('admin', 'PATCH', `/users/${ADMIN.email}`, { isAdmin: false });
    expect(demote.statusCode).toBe(422);
    expect(demote.json()).toEqual({ error: 'cannot_change_self' });
    expect((await call('admin', 'DELETE', `/users/${ADMIN.email}`)).statusCode).toBe(422);
  });

  it('422 when the last admin removes or demotes themself', async () => {
    // Other test files seed admins into the same database, so which of the two codes comes back
    // depends on them; the exact last_admin / cannot_change_self split is unit-tested.
    await pool.query('update allowed_users set is_admin = false where email = $1', [ADMIN2.email]);
    for (const res of [
      await call('admin', 'PATCH', `/users/${ADMIN.email}`, { isAdmin: false }),
      await call('admin', 'DELETE', `/users/${ADMIN.email}`),
    ]) {
      expect(res.statusCode).toBe(422);
      expect(['last_admin', 'cannot_change_self']).toContain(res.json().error);
    }
  });

  it('keeps notes when a user is removed and gives them back on re-add', async () => {
    await call('admin', 'POST', '/users', { email: NEWBIE.email });
    const created = await call('newbie', 'POST', '/notes', {
      body: 'kept note',
      clientId: 'bbbbbbbb-0000-4000-8000-000000000001',
      today: new Date().toISOString().slice(0, 10),
      locale: 'en',
    });
    expect(created.statusCode).toBe(201);
    await call('admin', 'DELETE', `/users/${NEWBIE.email}`);
    await call('admin', 'POST', '/users', { email: NEWBIE.email });
    const notes = NoteList.parse((await call('newbie', 'GET', '/notes')).json());
    expect(notes.map((n) => n.body)).toContain('kept note');
  });

  it('an admin sees only their own notes and taxonomy', async () => {
    await call('member', 'POST', '/categories', { name: 'member-private' });
    await call('member', 'POST', '/notes', {
      body: 'member secret',
      clientId: 'bbbbbbbb-0000-4000-8000-000000000002',
      today: new Date().toISOString().slice(0, 10),
      locale: 'en',
    });
    const notes = NoteList.parse((await call('admin', 'GET', '/notes')).json());
    expect(notes.map((n) => n.body)).not.toContain('member secret');
    const tax = (await call('admin', 'GET', '/taxonomy')).json();
    expect(JSON.stringify(tax)).not.toContain('member-private');
    await pool.query('delete from categories where user_id = $1', [MEMBER.id]);
  });
});
