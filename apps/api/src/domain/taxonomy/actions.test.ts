import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createPool } from '../../db';
import { captureLogs } from '../../test-logs';
import { ALLOWED_USER } from '../../test-auth';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('applyActions logs', () => {
  const pool = createPool(databaseUrl ?? '');
  beforeAll(async () => {
    await pool.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
       on conflict do nothing`,
      [ALLOWED_USER.id, ALLOWED_USER.email],
    );
  });
  afterAll(async () => {
    await pool.query('delete from categories where user_id = $1', [ALLOWED_USER.id]);
    await pool.query('delete from auth.users where id = $1', [ALLOWED_USER.id]);
    await pool.end();
  });

  it('logs the outcome and each rejection without names', async () => {
    const { app, lines } = captureLogs({ db: pool });
    const name = `secret-${randomUUID()}`;
    const other = `other-${randomUUID()}`;
    const headers = { authorization: 'Bearer allowed' };
    const first = await app.inject({
      method: 'POST',
      url: '/categories',
      headers,
      payload: { name },
    });
    expect(first.statusCode).toBe(201);
    const res = await app.inject({
      method: 'POST',
      url: '/taxonomy/actions',
      headers,
      payload: {
        actions: [
          { action: 'create', kind: 'category', name: other },
          { action: 'create', kind: 'category', name },
          { action: 'create', kind: 'category', name: `${other}-2` },
        ],
      },
    });
    expect(res.json()).toEqual({
      results: [{ ok: true }, { ok: false, error: 'name_taken' }, { ok: true }],
    });
    const applied = lines.filter((l) => l.msg === 'actions applied');
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ applied: 2, failed: 1 });
    const rejected = lines.filter((l) => l.msg === 'action rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      index: 1,
      action: 'create',
      kind: 'category',
      error: 'name_taken',
    });
    const text = JSON.stringify(lines);
    expect(text).not.toContain(name);
    expect(text).not.toContain(other);
    await app.close();
  });
});
