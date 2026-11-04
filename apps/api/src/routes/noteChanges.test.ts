import { Attachment, NoteChanges, NoteList } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
import { captureLogs } from '../test-logs';

const ME = { id: '88888888-8888-4888-8888-888888888881', email: 'changes-me@example.com' };
const OTHER = { id: '88888888-8888-4888-8888-888888888882', email: 'changes-other@example.com' };
const verifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ME;
  if (token === 'other') return OTHER;
  throw new Error('invalid token');
};
const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('GET /notes/changes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const { app, lines } = captureLogs({
    db: pool,
    verifyToken,
    allowedEmails: new Set([ME.email, OTHER.email]),
  });
  const mine = { authorization: 'Bearer allowed' };
  const theirs = { authorization: 'Bearer other' };
  const ids = [ME.id, OTHER.id];

  const send = (
    headers: typeof mine,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    extra: object = {},
  ) => app.inject({ method, url, headers, ...extra });
  const changes = async (headers: typeof mine, since?: string) => {
    const q = since === undefined ? '' : `?since=${encodeURIComponent(since)}`;
    const res = await send(headers, 'GET', `/notes/changes${q}`);
    expect(res.statusCode).toBe(200);
    return NoteChanges.parse(res.json());
  };
  const clean = async () => {
    await pool.query('delete from notes where user_id = any($1)', [ids]);
    await pool.query('delete from workspaces where user_id = any($1)', [ids]);
  };
  async function workspace(userId: string, isDefault: boolean) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into workspaces (user_id, name, is_default) values ($1, $2, $3) returning id`,
      [userId, isDefault ? 'כללי' : `ws-${crypto.randomUUID()}`, isDefault],
    );
    return rows[0]?.id ?? '';
  }
  async function note(userId: string, workspaceId: string, updatedAt = 'now()') {
    const { rows } = await pool.query<{ id: string }>(
      `insert into notes (user_id, client_id, body, workspace_id, updated_at)
       values ($1, gen_random_uuid(), 'secret text', $2, ${updatedAt}) returning id`,
      [userId, workspaceId],
    );
    return rows[0]?.id ?? '';
  }
  const old = "now() - interval '1 hour'";
  let ws = '';

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
  const fresh = async () => {
    await clean();
    ws = await workspace(ME.id, true);
  };

  it('full sync returns live notes only, no deletedIds, a cursor, and matches GET /notes', async () => {
    await fresh();
    const live = await note(ME.id, ws);
    const gone = await note(ME.id, ws);
    await pool.query('update notes set deleted_at = now() where id = $1', [gone]);
    await note(OTHER.id, await workspace(OTHER.id, true));
    const full = await changes(mine);
    expect(full.notes.map((n) => n.id)).toEqual([live]);
    expect(full.deletedIds).toEqual([]);
    expect(Number.isNaN(Date.parse(full.cursor))).toBe(false);
    const list = NoteList.parse((await send(mine, 'GET', '/notes')).json());
    expect(full.notes).toEqual(list);
  });

  it('with since returns edited notes, deletions and restores; never other users’ notes', async () => {
    await fresh();
    const edited = await note(ME.id, ws, old);
    const untouched = await note(ME.id, ws, old);
    const deleted = await note(ME.id, ws, old);
    const theirWs = await workspace(OTHER.id, true);
    const theirNote = await note(OTHER.id, theirWs);
    await pool.query('update notes set deleted_at = now() where id = $1', [
      await note(OTHER.id, theirWs),
    ]);
    const { cursor } = await changes(mine);
    await pool.query('update notes set body = $2, updated_at = now() where id = $1', [edited, 'x']);
    expect((await send(mine, 'DELETE', `/notes/${deleted}`)).statusCode).toBe(204);
    const delta = await changes(mine, cursor);
    const got = delta.notes.map((n) => n.id);
    expect(got).toContain(edited);
    expect(got).not.toContain(untouched);
    expect(got).not.toContain(deleted);
    expect(got).not.toContain(theirNote);
    expect(delta.deletedIds).toEqual([deleted]);
    expect((await send(mine, 'POST', `/notes/${deleted}/restore`)).statusCode).toBe(200);
    const after = await changes(mine, cursor);
    expect(after.notes.map((n) => n.id)).toContain(deleted);
    expect(after.deletedIds).toEqual([]);
    const theirs2 = await changes(theirs, cursor);
    expect(theirs2.notes.map((n) => n.id)).not.toContain(edited);
    expect(theirs2.deletedIds).not.toContain(deleted);
  });

  it('attachment add/delete and workspace delete put the note in the next delta', async () => {
    await fresh();
    const id = await note(ME.id, ws, old);
    const other = await workspace(ME.id, false);
    const inOther = await note(ME.id, other, old);
    const stale = new Date().toISOString();
    const backdate = () =>
      pool.query("update notes set updated_at = now() - interval '1 hour' where user_id = $1", [
        ME.id,
      ]);
    const boundary = 'xBx';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${boundary}--\r\n`,
      ),
    ]);
    expect((await changes(mine, stale)).notes.map((n) => n.id)).not.toContain(id);
    const added = await send(mine, 'POST', `/notes/${id}/attachments`, {
      payload,
      headers: { ...mine, 'content-type': `multipart/form-data; boundary=${boundary}` },
    });
    expect(added.statusCode).toBe(201);
    expect((await changes(mine, stale)).notes.map((n) => n.id)).toContain(id);
    await backdate();
    const addedBody = Attachment.safeParse(added.json());
    if (!addedBody.success) throw new Error('attachment response did not parse');
    const attId = addedBody.data.id;
    expect((await send(mine, 'DELETE', `/notes/${id}/attachments/${attId}`)).statusCode).toBe(204);
    expect((await changes(mine, stale)).notes.map((n) => n.id)).toContain(id);
    await backdate();
    expect((await changes(mine, stale)).notes.map((n) => n.id)).not.toContain(inOther);
    expect((await send(mine, 'DELETE', `/workspaces/${other}`)).statusCode).toBe(204);
    const moved = await changes(mine, stale);
    expect(moved.notes.find((n) => n.id === inOther)?.workspaceId).toBe(ws);
  });

  it('400s on a since that is not an ISO datetime', async () => {
    for (const since of ['yesterday', '2026-01-01', '']) {
      const res = await send(mine, 'GET', `/notes/changes?since=${encodeURIComponent(since)}`);
      expect(res.statusCode).toBe(400);
    }
  });

  it('logs one outcome line with counts and no note text', async () => {
    await fresh();
    await note(ME.id, ws);
    lines.length = 0;
    await changes(mine);
    const outcome = lines.filter((l) => l.msg === 'note changes listed');
    expect(outcome).toHaveLength(1);
    expect(outcome[0]).toMatchObject({ full: true, changed: 1, deleted: 0 });
    expect(JSON.stringify(lines)).not.toContain('secret text');
  });
});
