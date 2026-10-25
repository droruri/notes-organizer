import { describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import { allowedEmails, fakeVerifyToken } from '../test-auth';
import { buildServer } from '../server';
import type { Db } from '../db';

const db = { query: async () => ({ rows: [] }) } as unknown as Db;
const today = new Date().toISOString().slice(0, 10);
const app = buildServer({
  db,
  ai: createFakeAi([], 'x', 'hello from fake'),
  verifyToken: fakeVerifyToken,
  allowedEmails,
});
const headers = { authorization: 'Bearer allowed' };
const payload = { messages: [{ role: 'user', content: 'hi' }], today, locale: 'en' };

describe('POST /chat', () => {
  it('streams the scripted answer as SSE', async () => {
    const res = await app.inject({ method: 'POST', url: '/chat', headers, payload });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('"type":"text-delta"');
    expect(res.body).toContain('hello from fake');
  });

  it('rejects a bad body, a missing token, and the 31st request in a minute', async () => {
    const bad = await app.inject({ method: 'POST', url: '/chat', headers, payload: {} });
    expect(bad.statusCode).toBe(400);
    const anon = await app.inject({ method: 'POST', url: '/chat', payload });
    expect(anon.statusCode).toBe(401);
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      codes.push((await app.inject({ method: 'POST', url: '/chat', headers, payload })).statusCode);
    }
    expect(codes.at(-1)).toBe(429);
  });
});
