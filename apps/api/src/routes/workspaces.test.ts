import { readFileSync } from 'node:fs';
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

  const send = (
    headers: typeof mine,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });

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

  it('lets the AI pick an owned workspace, ignoring an unknown id', async () => {
    await clean();
    const owned = Workspace.parse(
      (await send(mine, 'POST', '/workspaces', { name: 'ידע' })).json(),
    );
    const defaultId = (await list(mine)).find((w) => w.isDefault)?.id;
    const create = async (workspaceId: string, currentId: string) => {
      const picking = buildServer({
        db: pool,
        ai: createFakeAi([{ value: { workspaceId } }]),
        verifyToken,
        allowedEmails,
      });
      const res = await picking.inject({
        method: 'POST',
        url: '/notes',
        headers: mine,
        payload: {
          body: 'hello',
          clientId: crypto.randomUUID(),
          today,
          locale: 'en',
          workspaceId: currentId,
        },
      });
      await picking.close();
      expect(res.statusCode).toBe(201);
      return NoteCreated.parse(res.json());
    };
    const picked = await create(owned.id, defaultId ?? '');
    expect(picked.note.workspaceId).toBe(owned.id);
    expect(picked.suggestion.workspaceId).toBe(owned.id);
    const unknown = await create(crypto.randomUUID(), owned.id);
    expect(unknown.note.workspaceId).toBe(owned.id);
  });

  it('moves a note to an owned workspace and rejects another user’s with 422', async () => {
    await clean();
    const owned = Workspace.parse(
      (await send(mine, 'POST', '/workspaces', { name: 'ידע' })).json(),
    );
    const foreign = Workspace.parse(
      (await send(theirs, 'POST', '/workspaces', { name: 'other-ws' })).json(),
    );
    const { app: logged, lines } = captureLogs({ db: pool, verifyToken, allowedEmails });
    const created = await logged.inject({
      method: 'POST',
      url: '/notes',
      headers: mine,
      payload: { body: 'secret text', clientId: crypto.randomUUID(), today, locale: 'en' },
    });
    const id = NoteCreated.parse(created.json()).note.id;
    const patch = (workspaceId: string) =>
      logged.inject({
        method: 'PATCH',
        url: `/notes/${id}`,
        headers: mine,
        payload: { workspaceId },
      });
    const moved = await patch(owned.id);
    expect(moved.statusCode).toBe(200);
    expect(moved.json().workspaceId).toBe(owned.id);
    const refused = await patch(foreign.id);
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toEqual({ error: 'unknown_workspace' });
    await logged.close();
    expect(lines.find((l) => l.msg === 'draft saved')).toMatchObject({ workspacePicked: false });
    expect(lines.find((l) => l.msg === 'note updated')).toMatchObject({ workspaceChanged: true });
    expect(lines.find((l) => l.msg === 'note update failed')).toMatchObject({
      noteId: id,
      error: 'unknown_workspace',
    });
    expect(JSON.stringify(lines)).not.toContain('secret text');
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

  const makeWs = async (name: string) =>
    Workspace.parse((await send(mine, 'POST', '/workspaces', { name })).json());
  const noteIn = async (workspaceId: string, deleted = false) => {
    await pool.query(
      `insert into notes (user_id, client_id, body, workspace_id, deleted_at)
       values ($1, gen_random_uuid(), 'n', $2, ${deleted ? 'now()' : 'null'})`,
      [ME.id, workspaceId],
    );
  };

  it('renames (200), refuses a taken name (409), a blank one (400) and another user’s id (404)', async () => {
    await clean();
    const ws = await makeWs('ידע');
    await makeWs('Work');
    const ok = await send(mine, 'PATCH', `/workspaces/${ws.id}`, { name: ' Notes ' });
    expect(ok.statusCode).toBe(200);
    expect(Workspace.parse(ok.json())).toMatchObject({ id: ws.id, name: 'Notes' });
    const taken = await send(mine, 'PATCH', `/workspaces/${ws.id}`, { name: 'work' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'name_taken' });
    const blank = await send(mine, 'PATCH', `/workspaces/${ws.id}`, { name: '  ' });
    expect(blank.statusCode).toBe(400);
    const foreign = await send(theirs, 'PATCH', `/workspaces/${ws.id}`, { name: 'x' });
    expect(foreign.statusCode).toBe(404);
    expect((await send(theirs, 'DELETE', `/workspaces/${ws.id}`)).statusCode).toBe(404);
  });

  it('set-default leaves exactly one default', async () => {
    await clean();
    const ws = await makeWs('ידע');
    const res = await send(mine, 'PATCH', `/workspaces/${ws.id}`, { isDefault: true });
    expect(res.statusCode).toBe(200);
    const all = await list(mine);
    expect(all.filter((w) => w.isDefault).map((w) => w.id)).toEqual([ws.id]);
  });

  it('delete moves all notes (soft-deleted too) to the default and refuses the default', async () => {
    await clean();
    const ws = await makeWs('ידע');
    const def = (await list(mine)).find((w) => w.isDefault);
    await noteIn(ws.id);
    await noteIn(ws.id, true);
    const gone = await send(mine, 'DELETE', `/workspaces/${ws.id}`);
    expect(gone.statusCode).toBe(204);
    expect((await list(mine)).map((w) => w.id)).toEqual([def?.id]);
    const { rows } = await pool.query<{ workspace_id: string }>(
      'select workspace_id from notes where user_id = $1',
      [ME.id],
    );
    expect(rows.map((r) => r.workspace_id)).toEqual([def?.id, def?.id]);
    const refused = await send(mine, 'DELETE', `/workspaces/${def?.id}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'is_default' });
  });

  it('logs workspace updated / update failed / deleted / delete failed', async () => {
    await clean();
    const ws = await makeWs('ידע');
    const def = (await list(mine)).find((w) => w.isDefault);
    await noteIn(ws.id);
    const { app: logged, lines } = captureLogs({ db: pool, verifyToken, allowedEmails });
    const call = (method: 'PATCH' | 'DELETE', id: string | undefined, payload?: object) =>
      logged.inject({
        method,
        url: `/workspaces/${id}`,
        headers: mine,
        ...(payload ? { payload } : {}),
      });
    await call('PATCH', ws.id, { name: 'New', isDefault: true });
    await call('PATCH', ws.id, { name: '  ' });
    await call('DELETE', ws.id);
    await call('DELETE', def?.id);
    await logged.close();
    expect(lines.find((l) => l.msg === 'workspace updated')).toMatchObject({
      workspaceId: ws.id,
      renamed: true,
      madeDefault: true,
    });
    expect(lines.find((l) => l.msg === 'workspace update failed')).toMatchObject({
      workspaceId: ws.id,
      error: 'invalid_name',
    });
    expect(lines.find((l) => l.msg === 'workspace delete failed')).toMatchObject({
      workspaceId: ws.id,
      error: 'is_default',
    });
    expect(lines.find((l) => l.msg === 'workspace deleted')).toMatchObject({
      workspaceId: def?.id,
      movedNotes: 0,
    });
  });
  it('the contract migration moves a null-workspace note into its user’s default', async () => {
    await clean();
    const sql = readFileSync(
      new URL(
        '../../../../supabase/migrations/20261031130000_notes_workspace_required.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await pool.query('alter table notes alter column workspace_id drop not null');
    try {
      await pool.query(
        `insert into notes (user_id, client_id, body) values ($1, gen_random_uuid(), 'legacy')`,
        [ME.id],
      );
      await pool.query(sql);
      const { rows } = await pool.query<{ is_default: boolean }>(
        `select w.is_default from notes n join workspaces w on w.id = n.workspace_id
         where n.user_id = $1 and n.body = 'legacy'`,
        [ME.id],
      );
      expect(rows).toEqual([{ is_default: true }]);
    } finally {
      await clean();
      await pool.query('alter table notes alter column workspace_id set not null');
    }
  });
});
