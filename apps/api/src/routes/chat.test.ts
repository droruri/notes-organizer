import { describe, expect, it } from 'vite-plus/test';
import { simulateReadableStream, streamText, stepCountIs } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { createFakeAi, type Ai } from '../ai/provider';
import { allowListDb as db, allowedEmails, fakeVerifyToken } from '../test-auth';
import { buildServer } from '../server';

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

  it('returns a clean 500 when loading the taxonomy fails', async () => {
    const failing = buildServer({
      db: {
        query: async (sql: string) => {
          if (sql.includes('allowed_users')) return { rows: [{ is_admin: false }] };
          throw new Error('db down');
        },
      } as unknown as Parameters<typeof buildServer>[0]['db'],
      ai: createFakeAi([], 'x', 'hello'),
      verifyToken: fakeVerifyToken,
      allowedEmails,
    });
    const res = await failing.inject({ method: 'POST', url: '/chat', headers, payload });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'chat_failed' });
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

  it('lets the 31st request through when rate limits are off', async () => {
    const unlimited = buildServer({
      db,
      ai: createFakeAi([], 'x', 'hello'),
      verifyToken: fakeVerifyToken,
      allowedEmails,
      rateLimited: false,
    });
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      codes.push(
        (await unlimited.inject({ method: 'POST', url: '/chat', headers, payload })).statusCode,
      );
    }
    expect(codes.every((c) => c === 200)).toBe(true);
  });
});

describe('POST /chat proposals', () => {
  it('streams one data-actions part per valid action and none for errors', async () => {
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const changes = [
      { action: 'create', kind: 'category', name: 'Alpha' },
      { action: 'delete', kind: 'category', id: 'nope' },
      { action: 'create', kind: 'category', name: 'Beta' },
    ];
    const chat: Ai['chat'] = (args) => {
      return streamText({
        system: args.system,
        messages: args.messages,
        tools: args.tools,
        stopWhen: stepCountIs(args.maxSteps),
        model: new MockLanguageModelV4({
          doStream: [
            {
              stream: simulateReadableStream({
                chunks: [
                  { type: 'stream-start', warnings: [] },
                  {
                    type: 'tool-call',
                    toolCallId: 'c1',
                    toolName: 'propose_change',
                    input: JSON.stringify({ changes }),
                  },
                  { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool' }, usage },
                ],
              }),
            },
            {
              stream: simulateReadableStream({
                chunks: [
                  { type: 'stream-start', warnings: [] },
                  { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
                ],
              }),
            },
          ],
        }),
      });
    };
    const base = createFakeAi();
    const proposeApp = buildServer({
      db,
      ai: { ...base, chat },
      verifyToken: fakeVerifyToken,
      allowedEmails,
    });
    const res = await proposeApp.inject({ method: 'POST', url: '/chat', headers, payload });
    const parts = res.body
      .split('\n\n')
      .filter((l) => l.startsWith('data: {'))
      .map((l) => JSON.parse(l.slice(6)));
    const actions = parts.filter((p) => p.type === 'data-actions');
    expect(actions.map((p) => p.data)).toEqual([
      [{ action: 'create', kind: 'category', name: 'Alpha' }],
      [{ action: 'create', kind: 'category', name: 'Beta' }],
    ]);
  });
});
