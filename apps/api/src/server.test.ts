import { HealthResponse } from '@notes/shared';
import { afterAll, describe, expect, it } from 'vite-plus/test';
import { createPool } from './db';
import { buildServer } from './server';

const databaseUrl = process.env.DATABASE_URL;

describe('GET /health', () => {
  // The pool connects lazily, and the shallow check never queries.
  const app = buildServer({ db: createPool('postgresql://unused@127.0.0.1:1/none') });
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
  const app = buildServer({ db: pool });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('reaches the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/health?deep=1' });
    expect(res.json()).toEqual({ ok: true, db: true });
  });
});
