import {
  ATTACHMENT_QUOTA_BYTES,
  Attachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_NOTE,
  NoteList,
} from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
import { captureLogs } from '../test-logs';

const ME = { id: 'bbbbbbbb-0000-4000-8000-000000000001', email: 'att-me@example.com' };
const OTHER = { id: 'bbbbbbbb-0000-4000-8000-000000000002', email: 'att-other@example.com' };
const verifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ME;
  if (token === 'other') return OTHER;
  throw new Error('invalid token');
};

const databaseUrl = process.env.DATABASE_URL;
const mine = { authorization: 'Bearer allowed' };
const theirs = { authorization: 'Bearer other' };
const SECRET_NAME = 'secret-medical-report.pdf';

function multipart(name: string, mime: string, data: Buffer) {
  const boundary = 'xBOUNDARYx';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`;
  const payload = Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe.skipIf(!databaseUrl)('attachment routes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const { app, lines } = captureLogs({
    db: pool,
    verifyToken,
    allowedEmails: new Set([ME.email, OTHER.email]),
  });

  const clean = async () => {
    await pool.query('delete from notes where user_id = any($1)', [[ME.id, OTHER.id]]);
  };
  async function note(userId = ME.id, deleted = false) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into notes (user_id, client_id, body, deleted_at) values ($1, gen_random_uuid(), 'n', ${deleted ? 'now()' : 'null'}) returning id`,
      [userId],
    );
    return rows[0]?.id ?? '';
  }
  const upload = (
    noteId: string,
    file: { name?: string; mime?: string; data?: Buffer } = {},
    headers = mine,
  ) => {
    const m = multipart(
      file.name ?? 'a.pdf',
      file.mime ?? 'application/pdf',
      file.data ?? Buffer.from('%PDF-1'),
    );
    return app.inject({
      method: 'POST',
      url: `/notes/${noteId}/attachments`,
      headers: { ...headers, ...m.headers },
      payload: m.payload,
    });
  };

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

  it('stores a file and serves the same bytes and mime back', async () => {
    const id = await note();
    const data = Buffer.from([0, 1, 2, 255, 254]);
    const res = await upload(id, { name: SECRET_NAME, mime: 'image/png', data });
    expect(res.statusCode).toBe(201);
    const att = Attachment.parse(res.json());
    expect(att).toMatchObject({ name: SECRET_NAME, mime: 'image/png', size: 5 });
    const got = await app.inject({
      method: 'GET',
      url: `/notes/${id}/attachments/${att.id}`,
      headers: mine,
    });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(got.rawPayload.equals(data)).toBe(true);
  });

  it('works on a draft and lists metadata only in GET /notes', async () => {
    const id = await note();
    const att = Attachment.parse((await upload(id)).json());
    const list = await app.inject({ method: 'GET', url: '/notes', headers: mine });
    const found = NoteList.parse(list.json()).find((n) => n.id === id);
    expect(found?.attachments).toEqual([att]);
    expect(Object.keys(found?.attachments[0] ?? {}).sort()).toEqual(
      ['createdAt', 'id', 'mime', 'name', 'size'].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('cleans the file name', async () => {
    const id = await note();
    const att = Attachment.parse(
      (await upload(id, { name: 'a..b.txt', mime: 'text/plain' })).json(),
    );
    expect(att.name).toBe('a..b.txt');
  });

  it('rejects an unsupported type with 415', async () => {
    const res = await upload(await note(), { mime: 'text/html' });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual({ error: 'unsupported_type' });
  });

  it('rejects a file over 10 MB with 413', async () => {
    const res = await upload(await note(), { data: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: 'attachment_too_large' });
  });

  it('rejects the 21st file with 422', async () => {
    const id = await note();
    await pool.query(
      `insert into note_attachments (note_id, name, mime, size, data)
       select $1, 'f' || g, 'text/plain', 1, 'x'::bytea from generate_series(1, $2) g`,
      [id, MAX_ATTACHMENTS_PER_NOTE],
    );
    const res = await upload(id);
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'too_many_attachments' });
  });

  it('rejects a file past the 30 MB user quota with 422', async () => {
    const id = await note();
    await pool.query(
      `insert into note_attachments (note_id, name, mime, size, data)
       values ($1, 'big', 'text/plain', $2, repeat('x', $2::int)::bytea)`,
      [id, ATTACHMENT_QUOTA_BYTES - 3],
    );
    const res = await upload(await note(), { data: Buffer.from('abcd') });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'quota_exceeded' });
    await pool.query('delete from note_attachments where note_id = $1', [id]);
  });

  it('400 for an empty file or no file part', async () => {
    const id = await note();
    expect((await upload(id, { data: Buffer.alloc(0) })).statusCode).toBe(400);
    const none = await app.inject({
      method: 'POST',
      url: `/notes/${id}/attachments`,
      headers: mine,
      payload: { a: 1 },
    });
    expect(none.statusCode).toBe(400);
  });

  it("404 for another user's note, a soft-deleted note, an unknown note and a bad id", async () => {
    const others = await note(OTHER.id);
    const att = Attachment.parse((await upload(others, {}, theirs)).json());
    expect((await upload(others)).statusCode).toBe(404);
    const read = await app.inject({
      method: 'GET',
      url: `/notes/${others}/attachments/${att.id}`,
      headers: mine,
    });
    expect(read.statusCode).toBe(404);

    const gone = await note();
    const kept = Attachment.parse((await upload(gone)).json());
    await pool.query('update notes set deleted_at = now() where id = $1', [gone]);
    expect((await upload(gone)).statusCode).toBe(404);
    const readGone = await app.inject({
      method: 'GET',
      url: `/notes/${gone}/attachments/${kept.id}`,
      headers: mine,
    });
    expect(readGone.statusCode).toBe(404);
    // Soft delete keeps the row, so Undo restores it.
    await pool.query('update notes set deleted_at = null where id = $1', [gone]);
    const back = await app.inject({
      method: 'GET',
      url: `/notes/${gone}/attachments/${kept.id}`,
      headers: mine,
    });
    expect(back.statusCode).toBe(200);

    expect((await upload(crypto.randomUUID())).statusCode).toBe(404);
    expect((await upload('not-a-uuid')).statusCode).toBe(404);
    const badRead = await app.inject({
      method: 'GET',
      url: `/notes/${gone}/attachments/nope`,
      headers: mine,
    });
    expect(badRead.statusCode).toBe(404);
  });

  it('lets only one of two parallel uploads at the per-note limit through', async () => {
    const id = await note();
    await pool.query(
      `insert into note_attachments (note_id, name, mime, size, data)
       select $1, 'f' || g, 'text/plain', 1, 'x'::bytea from generate_series(1, $2) g`,
      [id, MAX_ATTACHMENTS_PER_NOTE - 1],
    );
    const codes = (await Promise.all([upload(id), upload(id)]))
      .map((r) => r.statusCode)
      .sort((a, b) => a - b);
    expect(codes).toEqual([201, 422]);
  });

  it('logs added, rejected and served, and never the file name', async () => {
    const id = await note();
    const start = lines.length;
    const att = Attachment.parse((await upload(id, { name: SECRET_NAME })).json());
    await upload(id, { name: SECRET_NAME, mime: 'text/html' });
    await app.inject({ method: 'GET', url: `/notes/${id}/attachments/${att.id}`, headers: mine });
    const mine_ = lines.slice(start);
    expect(mine_.find((l) => l.msg === 'attachment added')).toMatchObject({
      level: 30,
      noteId: id,
      attachmentId: att.id,
      mime: 'application/pdf',
      bytes: 6,
    });
    expect(mine_.find((l) => l.msg === 'attachment rejected')).toMatchObject({
      level: 40,
      noteId: id,
      error: 'unsupported_type',
    });
    expect(mine_.find((l) => l.msg === 'attachment served')).toMatchObject({
      level: 30,
      noteId: id,
      attachmentId: att.id,
      bytes: 6,
    });
    expect(JSON.stringify(mine_)).not.toContain('secret-medical');
  });
});
