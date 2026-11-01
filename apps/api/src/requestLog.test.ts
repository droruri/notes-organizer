import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { createFakeAi, withLogging } from './ai/provider';
import { createPool } from './db';
import { createLinkReader, withLinkLogging, type LinkReader } from './domain/links/preview';
import { LogEnv, log, timed } from './requestLog';
import { buildServer } from './server';
import {
  allowListDb,
  allowedEmails,
  ALLOWED_USER,
  emptyAllowListDb,
  fakeVerifyToken,
} from './test-auth';

const Line = z.looseObject({
  level: z.number(),
  msg: z.string().optional(),
  reqId: z.string().optional(),
  userId: z.string().optional(),
  status: z.number().optional(),
  error: z.string().optional(),
  ms: z.number().optional(),
  finishReason: z.string().optional(),
  steps: z.number().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  chars: z.number().optional(),
  err: z.object({ name: z.string(), code: z.string().optional() }).optional(),
});
type Line = z.infer<typeof Line>;

function capture(db: Parameters<typeof buildServer>[0]['db'], links?: LinkReader) {
  const lines: Line[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      for (const l of chunk.toString().split('\n').filter(Boolean)) {
        const line = Line.safeParse(JSON.parse(l));
        if (!line.success) throw line.error;
        lines.push(line.data);
      }
      cb();
    },
  });
  const app = buildServer({
    db,
    ai: createFakeAi(),
    ...(links ? { links } : {}),
    verifyToken: fakeVerifyToken,
    allowedEmails,
    logger: { level: 'debug', stream },
  });
  return { app, lines };
}

describe('request logging', () => {
  it('correlates reqId and userId on an invalid body', async () => {
    const { app, lines } = capture(allowListDb);
    const res = await app.inject({
      method: 'POST',
      url: '/notes',
      headers: { authorization: 'Bearer allowed' },
      payload: { nope: 1 },
    });
    await app.close();
    expect(res.statusCode).toBe(400);
    const rejected = lines.find((l) => l.msg === 'request rejected');
    expect(rejected).toMatchObject({ status: 400, error: 'invalid_body', userId: ALLOWED_USER.id });
    const ids = new Set(lines.filter((l) => l.msg !== undefined).map((l) => l.reqId));
    expect(ids.size).toBe(1);
    expect(lines.some((l) => l.msg === 'incoming request')).toBe(true);
  });

  it('logs 401 and 403 rejections with their code', async () => {
    const a = capture(allowListDb);
    await a.app.inject({ method: 'GET', url: '/settings' });
    await a.app.close();
    expect(a.lines.find((l) => l.msg === 'request rejected')).toMatchObject({
      status: 401,
      error: 'unauthorized',
    });
    const b = capture(emptyAllowListDb);
    await b.app.inject({
      method: 'GET',
      url: '/settings',
      headers: { authorization: 'Bearer other' },
    });
    await b.app.close();
    expect(b.lines.find((l) => l.msg === 'request rejected')).toMatchObject({
      status: 403,
      error: 'not_allowed',
    });
  });

  it('stays silent by default', async () => {
    const app = buildServer({
      db: createPool('postgresql://unused@127.0.0.1:1/none'),
      ai: createFakeAi(),
      verifyToken: fakeVerifyToken,
      allowedEmails,
    });
    const write = vi.spyOn(process.stdout, 'write');
    await app.inject({ method: 'GET', url: '/settings' });
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    await app.close();
  });
});

describe('settings logs', () => {
  const dbWith = (settingsRow: Record<string, unknown>) =>
    ({
      query: async (sql: string) => ({
        rows: sql.includes('from allowed_users')
          ? [{ is_admin: false }]
          : sql.includes('from user_settings')
            ? [settingsRow]
            : [],
      }),
    }) as unknown as Parameters<typeof buildServer>[0]['db'];
  const headers = { authorization: 'Bearer allowed' };

  it('PUT /settings logs settings saved with the changed keys', async () => {
    const { app, lines } = capture(dbWith({ note_sort: 'urgency', note_form: null }));
    await app.inject({
      method: 'PUT',
      url: '/settings',
      headers,
      payload: { noteForm: { hiddenFields: ['title'] } },
    });
    await app.close();
    expect(lines.find((l) => l.msg === 'settings saved')).toMatchObject({ changed: ['noteForm'] });
  });

  it('warns on corrupt stored note_form and still returns the defaults', async () => {
    const { app, lines } = capture(
      dbWith({ note_sort: 'urgency', note_form: { hiddenFields: 5 } }),
    );
    const res = await app.inject({ method: 'GET', url: '/settings', headers });
    await app.close();
    expect(res.json()).toEqual({
      noteSort: 'urgency',
      noteForm: {
        hiddenFields: [],
        importance: { display: 'dropdown', hiddenValues: [] },
        urgency: { display: 'dropdown', hiddenValues: [] },
      },
    });
    expect(lines.find((l) => l.msg === 'stored settings invalid')).toMatchObject({
      level: 40,
      field: 'noteForm',
    });
  });
});

describe('log() and timed()', () => {
  it('log() outside a request is silent and usable', () => {
    expect(log().level).toBe('silent');
    expect(() => log().child({ a: 1 }).info('x')).not.toThrow();
  });

  it('timed returns the result and rethrows failures', async () => {
    expect(await timed('ok', {}, async () => 7)).toBe(7);
    await expect(
      timed('bad', {}, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('timed logs debug start/end with ms, and error with err + ms on throw', async () => {
    const { app, lines } = capture(allowListDb);
    app.get('/timed-ok', async () => timed('work', { noteId: 'n1' }, async () => 7));
    app.get('/timed-bad', async (_req, reply) => {
      try {
        await timed('work', { noteId: 'n2' }, async () => {
          throw Object.assign(new Error('secret note text'), { code: 'BOOM' });
        });
        return { ok: true };
      } catch {
        return reply.code(500).send({ ok: false });
      }
    });
    await app.inject({ method: 'GET', url: '/timed-ok' });
    await app.inject({ method: 'GET', url: '/timed-bad' });
    await app.close();
    expect(lines.find((l) => l.msg === 'work start')).toMatchObject({ level: 20, noteId: 'n1' });
    expect(lines.find((l) => l.msg === 'work end')).toMatchObject({
      level: 20,
      noteId: 'n1',
      ms: expect.any(Number),
    });
    expect(lines.find((l) => l.msg === 'work failed')).toMatchObject({
      level: 50,
      noteId: 'n2',
      ms: expect.any(Number),
      err: { name: 'Error', code: 'BOOM' },
    });
    expect(JSON.stringify(lines)).not.toContain('secret note text');
  });
});

describe('AI call logging', () => {
  const SECRET = 'secret note text';

  it('logs a failed extract with the error text, and never the prompt', async () => {
    const { app, lines } = capture(allowListDb);
    const ai = withLogging(createFakeAi());
    app.get('/probe', async () => ai.extract({ schema: z.string(), system: 's', prompt: SECRET }));
    await app.inject({ method: 'GET', url: '/probe' });
    await app.close();
    expect(lines.find((l) => l.msg === 'ai extract start')).toBeDefined();
    const failed = lines.find((l) => l.msg === 'ai extract failed');
    expect(failed).toMatchObject({
      level: 40,
      error: 'fake: no scripted turn',
      ms: expect.any(Number),
    });
    const incoming = lines.find((l) => l.msg === 'incoming request');
    expect(failed?.reqId).toEqual(expect.any(String));
    expect(failed?.reqId).toBe(incoming?.reqId);
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });

  it('logs transcription start/end, and a throw as a warning that is rethrown', async () => {
    const { app, lines } = capture(allowListDb);
    const ok = withLogging(createFakeAi([], SECRET));
    const broken = createFakeAi();
    broken.transcribe = async () => {
      throw new Error(SECRET);
    };
    const bad = withLogging(broken);
    const audio = new Uint8Array(4);
    app.get('/ok', async () => ok.transcribe({ audio, mime: 'audio/webm' }));
    app.get('/bad', async (_req, reply) =>
      bad.transcribe({ audio, mime: 'audio/webm' }).catch(() => reply.code(502).send({})),
    );
    await app.inject({ method: 'GET', url: '/ok' });
    const res = await app.inject({ method: 'GET', url: '/bad' });
    await app.close();
    expect(res.statusCode).toBe(502);
    expect(lines.find((l) => l.msg === 'transcription start')).toMatchObject({
      mime: 'audio/webm',
      bytes: 4,
    });
    expect(lines.find((l) => l.msg === 'transcription end')).toMatchObject({
      level: 30,
      chars: SECRET.length,
    });
    expect(lines.find((l) => l.msg === 'transcription failed')).toMatchObject({
      level: 40,
      err: { name: 'Error' },
    });
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });

  it('POST /chat logs chat finished with step and token counts', async () => {
    const { app, lines } = capture(allowListDb);
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      headers: { authorization: 'Bearer allowed' },
      payload: {
        messages: [{ role: 'user', content: SECRET }],
        today: new Date().toISOString().slice(0, 10),
        locale: 'en',
      },
    });
    await app.close();
    expect(res.statusCode).toBe(200);
    await vi.waitFor(() => expect(lines.some((l) => l.msg === 'chat finished')).toBe(true));
    expect(lines.find((l) => l.msg === 'chat finished')).toMatchObject({
      level: 30,
      finishReason: 'stop',
      steps: 1,
      inputTokens: 1,
      outputTokens: 1,
    });
    expect(JSON.stringify(lines)).not.toContain(SECRET);
  });
});

describe('link reader logging', () => {
  const URL_WITH_TOKEN = 'https://example.test/private/path?token=abc123';
  const nullReader: LinkReader = {
    preview: async () => null,
    read: async (url) => ({ url, ok: false }),
    readAll: async (urls) => urls.map((url) => ({ url, ok: urls[0] !== url })),
  };

  it('logs link unreachable with the host, never the full URL', async () => {
    const { app, lines } = capture(allowListDb, nullReader);
    const res = await app.inject({
      method: 'GET',
      url: `/links/preview?url=${encodeURIComponent(URL_WITH_TOKEN)}`,
      headers: { authorization: 'Bearer allowed' },
    });
    await app.close();
    expect(res.statusCode).toBe(422);
    expect(lines.find((l) => l.msg === 'link unreachable')).toMatchObject({
      level: 40,
      host: 'example.test',
      ms: expect.any(Number),
    });
    const text = JSON.stringify(lines);
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('/private/path');
  });

  it('logs links read with counts and failed hosts, skipped for no links', async () => {
    const { app, lines } = capture(allowListDb);
    const reader = withLinkLogging(nullReader);
    app.get('/read', async () =>
      reader.readAll([URL_WITH_TOKEN, 'https://ok.test/a', 'not a url']),
    );
    app.get('/none', async () => reader.readAll([]));
    await app.inject({ method: 'GET', url: '/read' });
    await app.inject({ method: 'GET', url: '/none' });
    await app.close();
    const read = lines.filter((l) => l.msg === 'links read');
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({
      level: 30,
      read: 2,
      failed: 1,
      failedHosts: ['example.test'],
    });
    expect(lines.find((l) => l.msg === 'links read start')).toMatchObject({ count: 3 });
    expect(JSON.stringify(lines)).not.toContain('abc123');
  });

  it('keeps the reader-internal cause at debug, host only', async () => {
    const reader = withLinkLogging(
      createLinkReader({
        lookup: async () => ['93.184.216.34'],
        fetch: async () => {
          throw Object.assign(new Error('connect to secret'), { code: 'ECONNRESET' });
        },
      }),
    );
    const { app, lines } = capture(allowListDb, reader);
    await app.inject({
      method: 'GET',
      url: `/links/preview?url=${encodeURIComponent(URL_WITH_TOKEN)}`,
      headers: { authorization: 'Bearer allowed' },
    });
    await app.close();
    const cause = lines.filter((l) => l.msg === 'link fetch failed');
    expect(cause.length).toBeGreaterThan(0);
    expect(cause[0]).toMatchObject({
      level: 20,
      host: 'example.test',
      err: { code: 'ECONNRESET' },
    });
    expect(lines.filter((l) => l.level >= 30 && l.msg === 'link fetch failed')).toEqual([]);
    expect(JSON.stringify(lines)).not.toContain('abc123');
  });
});

describe('LogEnv', () => {
  it('defaults to info and rejects unknown levels', () => {
    expect(LogEnv.parse({}).LOG_LEVEL).toBe('info');
    expect(LogEnv.safeParse({ LOG_LEVEL: 'loud' }).success).toBe(false);
  });
});
