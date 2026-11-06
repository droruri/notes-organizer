import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { Writable } from 'node:stream';
import { createFakeAi } from '../ai/provider';
import { createPool } from '../db';
import { createFakePush } from '../push/provider';
import { buildServer } from '../server';
import type { VerifyToken } from '../auth';

// Own users, so these tests don't race other suites that reset the shared ones.
const ALLOWED_USER = { id: 'a1a1a1a1-0000-4000-8000-000000000248', email: 'push-me@example.com' };
const OTHER_USER = { id: 'a2a2a2a2-0000-4000-8000-000000000248', email: 'push-other@example.com' };
const allowedEmails = new Set([ALLOWED_USER.email, OTHER_USER.email]);
const fakeVerifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ALLOWED_USER;
  if (token === 'other') return OTHER_USER;
  throw new Error('invalid token');
};

const databaseUrl = process.env.DATABASE_URL;
const mine = {
  endpoint: 'https://push.example.com/send/mine',
  keys: { p256dh: 'abc_-1', auth: 'def_-2' },
};
const theirs = {
  endpoint: 'https://push.example.com/send/theirs',
  keys: { p256dh: 'abc', auth: 'def' },
};
const as = (who: 'allowed' | 'other') => ({ authorization: `Bearer ${who}` });

describe.skipIf(!databaseUrl)('/push routes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const lines: Array<{ msg?: string; [k: string]: unknown }> = [];
  const stream = new Writable({
    write(chunk: Buffer, _e, cb) {
      for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l));
      cb();
    },
  });
  const fake = createFakePush({ goneEndpoints: ['https://push.example.com/send/dead'] });
  const app = buildServer({
    db: pool,
    ai: createFakeAi(),
    push: fake,
    verifyToken: fakeVerifyToken,
    allowedEmails,
    logger: { level: 'debug', stream },
  });

  beforeAll(async () => {
    await app.ready();
    for (const u of [ALLOWED_USER, OTHER_USER]) {
      await pool.query(
        `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
         on conflict do nothing`,
        [u.id, u.email],
      );
    }
  });
  beforeEach(async () => {
    await pool.query('delete from push_subscriptions where endpoint like $1', [
      'https://push.example.com/%',
    ]);
    await pool.query('delete from user_settings where user_id = any($1)', [[ALLOWED_USER.id]]);
    fake.sent.length = 0;
    lines.length = 0;
  });
  afterAll(async () => {
    await pool.query('delete from allowed_users where email = any($1)', [[...allowedEmails]]);
    await pool.query('delete from auth.users where id = any($1)', [
      [ALLOWED_USER.id, OTHER_USER.id],
    ]);
    await app.close();
    await pool.end();
  });

  const post = (who: 'allowed' | 'other', url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers: as(who), payload });
  const del = (who: 'allowed' | 'other', payload: object) =>
    app.inject({ method: 'DELETE', url: '/push/subscriptions', headers: as(who), payload });
  const count = async (endpoint: string) =>
    (await pool.query('select 1 from push_subscriptions where endpoint = $1', [endpoint])).rowCount;

  it('subscribes, logs, and moves ownership on re-subscribe', async () => {
    expect((await post('allowed', '/push/subscriptions', mine)).statusCode).toBe(204);
    expect(lines.some((l) => l.msg === 'push subscribed' && l.count === 1)).toBe(true);
    expect((await post('other', '/push/subscriptions', mine)).statusCode).toBe(204);
    const { rows } = await pool.query(
      'select user_id from push_subscriptions where endpoint = $1',
      [mine.endpoint],
    );
    expect(rows[0].user_id).toBe(OTHER_USER.id);
  });

  it('rejects a bad body with 400', async () => {
    expect(
      (
        await post('allowed', '/push/subscriptions', {
          endpoint: 'http://x.test/a',
          keys: mine.keys,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post('allowed', '/push/subscriptions', { endpoint: mine.endpoint })).statusCode,
    ).toBe(400);
    expect((await del('allowed', {})).statusCode).toBe(400);
  });

  it('unsubscribes only the caller’s endpoint', async () => {
    await post('allowed', '/push/subscriptions', mine);
    await post('other', '/push/subscriptions', theirs);
    expect((await del('allowed', { endpoint: theirs.endpoint })).statusCode).toBe(204);
    expect(await count(theirs.endpoint)).toBe(1);
    expect((await del('allowed', { endpoint: mine.endpoint })).statusCode).toBe(204);
    expect(await count(mine.endpoint)).toBe(0);
    expect(lines.some((l) => l.msg === 'push unsubscribed')).toBe(true);
  });

  it('sends a test to the caller’s devices only and logs it', async () => {
    await post('allowed', '/push/subscriptions', mine);
    await post('other', '/push/subscriptions', theirs);
    const res = await post('allowed', '/push/test', {});
    expect(res.json()).toEqual({ sent: 1, gone: 0 });
    expect(fake.sent.map((s) => s.sub.endpoint)).toEqual([mine.endpoint]);
    expect(lines.some((l) => l.msg === 'push test sent' && l.sent === 1 && l.gone === 0)).toBe(
      true,
    );
  });

  it('deletes a gone subscription and logs the failed send', async () => {
    const dead = { ...mine, endpoint: 'https://push.example.com/send/dead' };
    await post('allowed', '/push/subscriptions', dead);
    const res = await post('allowed', '/push/test', {});
    expect(res.json()).toEqual({ sent: 0, gone: 1 });
    expect(await count(dead.endpoint)).toBe(0);
    const failed = lines.find((l) => l.msg === 'push send failed');
    expect(failed).toMatchObject({ host: 'push.example.com', gone: true });
    expect(JSON.stringify(lines)).not.toContain('/send/dead');
  });

  it('saves timezone and reminderHour, rejects an invalid timezone', async () => {
    const put = (payload: object) =>
      app.inject({ method: 'PUT', url: '/settings', headers: as('allowed'), payload });
    const ok = await put({ timezone: 'Asia/Jerusalem', reminderHour: 7 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ timezone: 'Asia/Jerusalem', reminderHour: 7 });
    expect((await put({ timezone: 'Mars/Base' })).statusCode).toBe(400);
    expect((await put({ reminderHour: 24 })).statusCode).toBe(400);
    const reset = await put({ reminderHour: null });
    expect(reset.json()).toMatchObject({ timezone: 'Asia/Jerusalem', reminderHour: null });
  });
});
