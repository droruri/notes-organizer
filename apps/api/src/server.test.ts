import { HealthResponse } from '@notes/shared';
import { afterAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from './ai/provider';
import { createPool } from './db';
import { buildServer } from './server';
import { captureLogs } from './test-logs';
import { allowedEmails, ALLOWED_USER, emptyAllowListDb, fakeVerifyToken } from './test-auth';

const auth = { verifyToken: fakeVerifyToken, allowedEmails, ai: createFakeAi() };

const databaseUrl = process.env.DATABASE_URL;

describe('GET /health', () => {
  // The pool connects lazily, and the shallow check never queries.
  const app = buildServer({ db: createPool('postgresql://unused@127.0.0.1:1/none'), ...auth });
  afterAll(() => app.close());

  it('answers ok without touching the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ ok: true });
  });

  it('answers 503 on ?deep=1 when the database is unreachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health?deep=1' });
    expect(res.statusCode).toBe(503);
    expect(HealthResponse.parse(res.json())).toEqual({ ok: false, db: false });
  });
});

describe.skipIf(!databaseUrl)('GET /health?deep=1 against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const app = buildServer({ db: pool, ...auth });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('reaches the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/health?deep=1' });
    expect(res.json()).toEqual({ ok: true, db: true });
  });
});

describe('auth', () => {
  const app = buildServer({ db: createPool('postgresql://unused@127.0.0.1:1/none'), ...auth });
  afterAll(() => app.close());
  const get = (authorization?: string) =>
    app.inject({
      method: 'GET',
      url: '/settings',
      ...(authorization ? { headers: { authorization } } : {}),
    });

  it('401s without a token', async () => {
    const res = await get();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('401s with an invalid token', async () => {
    expect((await get('Bearer nope')).statusCode).toBe(401);
  });

  it('403s for an email that is not on the allow list', async () => {
    const empty = buildServer({ db: emptyAllowListDb, ...auth });
    const res = await empty.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: 'Bearer other' },
    });
    await empty.close();
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'not_allowed' });
  });
});

describe.skipIf(!databaseUrl)('/settings against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const app = buildServer({ db: pool, ...auth });
  const headers = { authorization: 'Bearer allowed' };
  afterAll(async () => {
    await pool.query('delete from user_settings where user_id = $1', [ALLOWED_USER.id]);
    await pool.query('delete from auth.users where id = $1', [ALLOWED_USER.id]);
    await app.close();
    await pool.end();
  });

  it('returns defaults, then round-trips a saved sort', async () => {
    await pool.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
       on conflict do nothing`,
      [ALLOWED_USER.id, ALLOWED_USER.email],
    );
    const first = await app.inject({ method: 'GET', url: '/settings', headers });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      noteSort: 'urgency',
      noteForm: {
        hiddenFields: [],
        importance: { display: 'dropdown', hiddenValues: [] },
        urgency: { display: 'dropdown', hiddenValues: [] },
      },
      quickActions: ['record'],
    });

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { noteSort: 'newest' },
    });
    expect(put.json()).toEqual({
      noteSort: 'newest',
      noteForm: {
        hiddenFields: [],
        importance: { display: 'dropdown', hiddenValues: [] },
        urgency: { display: 'dropdown', hiddenValues: [] },
      },
      quickActions: ['record'],
    });
    const again = await app.inject({ method: 'GET', url: '/settings', headers });
    expect(again.json()).toEqual({
      noteSort: 'newest',
      noteForm: {
        hiddenFields: [],
        importance: { display: 'dropdown', hiddenValues: [] },
        urgency: { display: 'dropdown', hiddenValues: [] },
      },
      quickActions: ['record'],
    });
  });

  it('keeps noteSort on a noteForm patch and noteForm on a noteSort patch', async () => {
    const form = {
      hiddenFields: ['dueDate'],
      importance: { display: 'dropdown', hiddenValues: [] },
      urgency: { display: 'dropdown', hiddenValues: [] },
    };
    const a = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { noteForm: form },
    });
    expect(a.json()).toEqual({ noteSort: 'newest', noteForm: form, quickActions: ['record'] });
    const b = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { noteSort: 'oldest' },
    });
    expect(b.json()).toEqual({ noteSort: 'oldest', noteForm: form, quickActions: ['record'] });
    const bad = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { noteForm: { hiddenFields: ['body'] } },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('saves quickActions without touching the rest, and noteForm keeps quickActions', async () => {
    const before = await app.inject({ method: 'GET', url: '/settings', headers });
    const { noteSort, noteForm } = before.json();
    const a = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { quickActions: ['import'] },
    });
    expect(a.json()).toEqual({ noteSort, noteForm, quickActions: ['import'] });
    const b = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { noteForm: { ...noteForm, hiddenFields: ['urgency'] } },
    });
    expect(b.json().quickActions).toEqual(['import']);
    const bad = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { quickActions: ['bogus'] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('logs "settings saved" with quickActions, and warns on an invalid stored value', async () => {
    const { app: logged, lines } = captureLogs({ db: pool });
    await logged.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { quickActions: ['workspaces', 'record'] },
    });
    expect(lines.find((l) => l.msg === 'settings saved')).toMatchObject({
      level: 30,
      changed: ['quickActions'],
    });
    await pool.query(
      `update user_settings set quick_actions = '"nope"'::jsonb where user_id = $1`,
      [ALLOWED_USER.id],
    );
    const res = await logged.inject({ method: 'GET', url: '/settings', headers });
    expect(res.json().quickActions).toEqual(['record']);
    expect(lines.find((l) => l.msg === 'stored settings invalid')).toMatchObject({
      level: 40,
      field: 'quickActions',
    });
    await pool.query('update user_settings set quick_actions = null where user_id = $1', [
      ALLOWED_USER.id,
    ]);
    await logged.close();
  });

  it('rejects an invalid body with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { noteSort: 'bogus' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('CORS preflight', () => {
  const webOrigin = 'https://web.example';
  const app = buildServer({
    db: createPool('postgresql://unused@127.0.0.1:1/none'),
    ...auth,
    webOrigin,
  });
  afterAll(() => app.close());

  it.each(['PUT', 'PATCH', 'DELETE'])('allows %s from the web origin', async (method) => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/notes/some-id',
      headers: { origin: webOrigin, 'access-control-request-method': method },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(String(res.headers['access-control-allow-methods'])).toContain(method);
  });
});
