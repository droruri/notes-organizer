import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { Writable } from 'node:stream';
import { createFakeAi } from '../ai/provider';
import { createPool } from '../db';
import { runReminders, MAX_SENDS_PER_RUN } from '../domain/reminders/reminders';
import { createFakePush } from '../push/provider';
import { buildServer } from '../server';

const USER = { id: 'a3a3a3a3-0000-4000-8000-000000000249', email: 'cron-me@example.com' };
const BAD = { id: 'a4a4a4a4-0000-4000-8000-000000000249', email: 'cron-bad@example.com' };
const databaseUrl = process.env.DATABASE_URL;
// 2026-11-10 06:30Z = 08:30 in Asia/Jerusalem (UTC+2); 05:30Z = 07:30 there.
const AFTER = new Date('2026-11-10T06:30:00Z');
const BEFORE = new Date('2026-11-10T05:30:00Z');
const TODAY = '2026-11-10';
const SUB = { endpoint: 'https://cron-push.example.net/mine', p256dh: 'a', auth: 'b' };

describe.skipIf(!databaseUrl)('due reminders against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const lines: Array<{ msg?: string; [k: string]: unknown }> = [];
  const stream = new Writable({
    write(chunk: Buffer, _e, cb) {
      for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l));
      cb();
    },
  });
  const fake = createFakePush({ goneEndpoints: ['https://cron-push.example.net/dead'] });
  let clock = AFTER;
  const build = (cronSecret: string | undefined, push = fake) =>
    buildServer({
      db: pool,
      ai: createFakeAi(),
      push,
      cronSecret,
      now: () => clock,
      verifyToken: async () => USER,
      allowedEmails: new Set([USER.email]),
      logger: { level: 'debug', stream },
    });
  const app = build('s3cret');
  let workspaceId = '';

  const addNote = async (
    over: {
      status?: string;
      due?: string;
      snooze?: string | null;
      deleted?: boolean;
      user?: string;
    } = {},
  ) => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into notes (user_id, client_id, body, status, due_date, snoozed_until, deleted_at, workspace_id)
       values ($1, gen_random_uuid(), 'buy milk', $2, $3, $4, $5, $6) returning id`,
      [
        over.user ?? USER.id,
        over.status ?? 'todo',
        over.due ?? TODAY,
        over.snooze ?? null,
        over.deleted ? new Date() : null,
        workspaceId,
      ],
    );
    return rows[0]?.id ?? '';
  };
  const run = () =>
    app.inject({ method: 'POST', url: '/cron/reminders', headers: { 'x-cron-secret': 's3cret' } });

  beforeAll(async () => {
    await app.ready();
    for (const u of [USER, BAD]) {
      await pool.query(
        `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
         on conflict do nothing`,
        [u.id, u.email],
      );
    }
    const ws = await pool.query<{ id: string }>(
      `insert into workspaces (user_id, name, is_default) values ($1, 'cron', true) returning id`,
      [USER.id],
    );
    workspaceId = ws.rows[0]?.id ?? '';
  });
  beforeEach(async () => {
    await pool.query('delete from notes where user_id = any($1)', [[USER.id, BAD.id]]);
    await pool.query('delete from push_subscriptions where user_id = any($1)', [[USER.id, BAD.id]]);
    await pool.query('delete from user_settings where user_id = any($1)', [[USER.id, BAD.id]]);
    await pool.query(
      `insert into user_settings (user_id, timezone) values ($1, 'Asia/Jerusalem')`,
      [USER.id],
    );
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'a', 'b')`,
      [USER.id, SUB.endpoint],
    );
    clock = AFTER;
    fake.sent.length = 0;
    lines.length = 0;
  });
  afterAll(async () => {
    await pool.query('delete from notes where user_id = any($1)', [[USER.id, BAD.id]]);
    await pool.query('delete from workspaces where user_id = $1', [USER.id]);
    await pool.query('delete from auth.users where id = any($1)', [[USER.id, BAD.id]]);
    await app.close();
    await pool.end();
  });

  it('sends after the reminder hour, not before', async () => {
    const id = await addNote();
    clock = BEFORE;
    expect((await run()).json()).toMatchObject({ sent: 0 });
    clock = AFTER;
    expect((await run()).json()).toEqual({ sent: 1, gone: 0, disabled: false });
    expect(fake.sent[0]?.payload).toEqual({ kind: 'due', noteId: id, title: 'buy milk' });
  });

  it('honours reminder_hour', async () => {
    await pool.query(`update user_settings set reminder_hour = 10 where user_id = $1`, [USER.id]);
    await addNote();
    expect((await run()).json()).toMatchObject({ sent: 0 });
  });

  it('skips done, draft, snoozed, deleted and not-due-today notes', async () => {
    await addNote({ status: 'done' });
    await addNote({ status: 'draft' });
    await addNote({ snooze: '2026-11-12' });
    await addNote({ deleted: true });
    await addNote({ due: '2026-11-11' });
    expect((await run()).json()).toMatchObject({ sent: 0 });
  });

  it('sends once; a changed due date re-arms', async () => {
    const id = await addNote();
    expect((await run()).json()).toMatchObject({ sent: 1 });
    expect((await run()).json()).toMatchObject({ sent: 0 });
    await pool.query(`update notes set due_date = '2026-11-09' where id = $1`, [id]);
    await pool.query(`update notes set due_date = $2 where id = $1`, [id, TODAY]);
    expect((await run()).json()).toMatchObject({ sent: 0 });
    clock = new Date('2026-11-11T06:30:00Z');
    await pool.query(`update notes set due_date = '2026-11-11' where id = $1`, [id]);
    expect((await run()).json()).toMatchObject({ sent: 1 });
  });

  it('deletes gone subscriptions', async () => {
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'a', 'b')`,
      [USER.id, 'https://cron-push.example.net/dead'],
    );
    await addNote();
    expect((await run()).json()).toEqual({ sent: 1, gone: 1, disabled: false });
    const left = await pool.query('select 1 from push_subscriptions where user_id = $1', [USER.id]);
    expect(left.rowCount).toBe(1);
  });

  it('skips a bad timezone with a warn', async () => {
    await pool.query(`update user_settings set timezone = 'Mars/Base' where user_id = $1`, [
      USER.id,
    ]);
    await addNote();
    expect((await run()).json()).toMatchObject({ sent: 0 });
    expect(lines.some((l) => l.msg === 'reminder candidate skipped' && l.level === 40)).toBe(true);
  });

  it('caps a run at 200 sends', async () => {
    await pool.query(
      `insert into notes (user_id, client_id, body, status, due_date, workspace_id)
       select $1, gen_random_uuid(), 'n' || g, 'todo', $2, $3 from generate_series(1, 205) g`,
      [USER.id, TODAY, workspaceId],
    );
    const result = await runReminders(pool, fake, AFTER);
    expect(result.sent).toBe(MAX_SENDS_PER_RUN);
    expect((await runReminders(pool, fake, AFTER)).sent).toBe(5);
  });

  it('counts every device toward the 200 cap', async () => {
    await pool.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'a', 'b')`,
      [USER.id, 'https://cron-push.example.net/second-device'],
    );
    await pool.query(
      `insert into notes (user_id, client_id, body, status, due_date, workspace_id)
       select $1, gen_random_uuid(), 'n' || g, 'todo', $2, $3 from generate_series(1, 101) g`,
      [USER.id, TODAY, workspaceId],
    );
    // Two devices per note: 100 notes fill the cap exactly; the 101st would exceed it.
    expect((await runReminders(pool, fake, AFTER)).sent).toBe(MAX_SENDS_PER_RUN);
  });

  it('logs the run', async () => {
    await addNote();
    await run();
    const line = lines.find((l) => l.msg === 'reminders run');
    expect(line).toMatchObject({ level: 30, due: 1, sent: 1, gone: 0 });
    expect(JSON.stringify(lines)).not.toContain('buy milk');
  });

  it('401 on a wrong secret, 503 without one, 200 disabled without push', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/cron/reminders',
      headers: { 'x-cron-secret': 'nope' },
    });
    expect(wrong.statusCode).toBe(401);
    const missing = await app.inject({ method: 'POST', url: '/cron/reminders' });
    expect(missing.statusCode).toBe(401);
    const unset = build(undefined);
    expect((await unset.inject({ method: 'POST', url: '/cron/reminders' })).statusCode).toBe(503);
    const off = build('s3cret', createFakePush({ enabled: false }));
    const res = await off.inject({
      method: 'POST',
      url: '/cron/reminders',
      headers: { 'x-cron-secret': 's3cret' },
    });
    expect(res.json()).toEqual({ sent: 0, gone: 0, disabled: true });
    const rejected = lines.filter((l) => l.msg === 'cron rejected');
    expect(rejected.map((l) => l.status)).toEqual([401, 401, 503]);
    await unset.close();
    await off.close();
  });
});
