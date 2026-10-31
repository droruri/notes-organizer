import { NoteCreated, Workspace, WorkspaceList } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
import { listWorkspaces } from '../domain/workspaces/service';
import { buildServer } from '../server';
import { captureLogs } from '../test-logs';

const ME = { id: 'a8a8a8a8-0000-4000-8000-000000000001', email: 'ws-me@example.com' };
const OTHER = { id: 'a8a8a8a8-0000-4000-8000-000000000002', email: 'ws-other@example.com' };
const verifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ME;
  if (token === 'other') return OTHER;
  throw new Error('invalid token');
};
const allowedEmails = new Set([ME.email, OTHER.email]);

const databaseUrl = process.env.DATABASE_URL;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!databaseUrl)('workspaces against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const app = buildServer({ db: pool, ai: createFakeAi(), verifyToken, allowedEmails });
  const mine = { authorization: 'Bearer allowed' };
  const theirs = { authorization: 'Bearer other' };

  const send = (headers: typeof mine, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, headers, ...(payload ? { payload } : {}) });

  const clean = async () => {
    const ids = [ME.id, OTHER.id];
    await pool.query('delete from notes where user_id = any($1)', [ids]);
    await pool.query('delete from workspaces where user_id = any($1)', [ids]);
  };
  const list = async (headers: typeof mine) =>
    WorkspaceList.parse((await send(headers, 'GET', '/workspaces')).json());

  beforeAll(async () => {
    for (const u of [ME, OTHER]) {
      await pool.query(
        `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
         on conflict do nothing`,
        [u.id, u.email],
      );
    }
  });
  afterAll(async () => {
    await clean();
    await app.close();
    await pool.end();
  });

  it('gives a user with no workspaces exactly one default, even under concurrent calls', async () => {
    await clean();
    const [x, y] = await Promise.all([listWorkspaces(pool, ME.id), listWorkspaces(pool, ME.id)]);
    expect(x).toHaveLength(1);
    expect(y).toHaveLength(1);
    expect(x[0]).toMatchObject({ name: 'כללי', isDefault: true });
    const { rows } = await pool.query('select 1 from workspaces where user_id = $1', [ME.id]);
    expect(rows).toHaveLength(1);
  });

  it('lists only the caller’s workspaces', async () => {
    await clean();
    await send(mine, 'POST', '/workspaces', { name: 'ידע' });
    await send(theirs, 'POST', '/workspaces', { name: 'secret' });
    const names = (await list(mine)).map((w) => w.name);
    expect(names).toEqual(['כללי', 'ידע']);
  });

  it('creates (201), rejects a duplicate in any case (409) and a blank name (400)', async () => {
    await clean();
    const created = await send(mine, 'POST', '/workspaces', { name: '  Work  ' });
    expect(created.statusCode).toBe(201);
    expect(Workspace.parse(created.json())).toMatchObject({ name: 'Work', isDefault: false });
    const dup = await send(mine, 'POST', '/workspaces', { name: 'WORK' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json()).toEqual({ error: 'name_taken' });
    const blank = await send(mine, 'POST', '/workspaces', { name: '   ' });
    expect(blank.statusCode).toBe(400);
    expect(blank.json()).toEqual({ error: 'invalid_name' });
  });

  it('stores a new note in the owned workspace, else in the caller’s default', async () => {
    await clean();
    const owned = Workspace.parse(
      (await send(mine, 'POST', '/workspaces', { name: 'ידע' })).json(),
    );
    const foreign = Workspace.parse(
      (await send(theirs, 'POST', '/workspaces', { name: 'other-ws' })).json(),
    );
    const defaultId = (await list(mine)).find((w) => w.isDefault)?.id;
    const create = async (workspaceId?: string) => {
      const res = await send(mine, 'POST', '/notes', {
        body: 'hello',
        clientId: crypto.randomUUID(),
        today,
        locale: 'en',
        ...(workspaceId ? { workspaceId } : {}),
      });
      expect(res.statusCode).toBe(201);
      return NoteCreated.parse(res.json()).note;
    };
    expect((await create(owned.id)).workspaceId).toBe(owned.id);
    expect((await create(foreign.id)).workspaceId).toBe(defaultId);
    expect((await create()).workspaceId).toBe(defaultId);
    const { rows } = await pool.query<{ workspace_id: string }>(
      'select workspace_id from notes where user_id = $1',
      [ME.id],
    );
    const stored = rows.map((r) => r.workspace_id);
    expect(stored.filter((id) => id === defaultId)).toHaveLength(2);
    expect(stored.filter((id) => id === owned.id)).toHaveLength(1);
  });

  it('logs workspaces listed, workspace created and workspace create failed', async () => {
    await clean();
    const { app: logged, lines } = captureLogs({ db: pool, verifyToken, allowedEmails });
    await logged.inject({ method: 'GET', url: '/workspaces', headers: mine });
    await logged.inject({
      method: 'POST',
      url: '/workspaces',
      headers: mine,
      payload: { name: 'ידע' },
    });
    await logged.inject({
      method: 'POST',
      url: '/workspaces',
      headers: mine,
      payload: { name: 'ידע' },
    });
    await logged.close();
    expect(lines.find((l) => l.msg === 'workspaces listed')).toMatchObject({
      count: 1,
      seeded: true,
    });
    expect(lines.find((l) => l.msg === 'workspace created')).toHaveProperty('workspaceId');
    expect(lines.find((l) => l.msg === 'workspace create failed')).toMatchObject({
      error: 'name_taken',
    });
    expect(JSON.stringify(lines)).not.toContain('ידע');
  });
});
