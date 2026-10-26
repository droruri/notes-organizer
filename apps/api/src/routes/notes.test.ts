import { MAX_AUDIO_BYTES, Note, NoteCreated, NoteList, Suggestion, Taxonomy } from '@notes/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../ai/provider';
import type { VerifyToken } from '../auth';
import { createPool } from '../db';
import { createLinkReader } from '../domain/links/preview';
import { buildServer } from '../server';
import { captureLogs } from '../test-logs';

const ME = { id: '66666666-6666-4666-8666-666666666666', email: 'notes-me@example.com' };
const OTHER = { id: '77777777-7777-4777-8777-777777777777', email: 'notes-other@example.com' };
const verifyToken: VerifyToken = async (token) => {
  if (token === 'allowed') return ME;
  if (token === 'other') return OTHER;
  throw new Error('invalid token');
};

const databaseUrl = process.env.DATABASE_URL;
const today = new Date().toISOString().slice(0, 10);

describe.skipIf(!databaseUrl)('notes routes against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const ai = createFakeAi();
  const app = buildServer({
    db: pool,
    ai,
    verifyToken,
    allowedEmails: new Set([ME.email, OTHER.email]),
  });
  const mine = { authorization: 'Bearer allowed' };
  const theirs = { authorization: 'Bearer other' };

  const send = (
    headers: typeof mine,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    p?: object,
  ) => app.inject({ method, url, headers, ...(p ? { payload: p } : {}) });

  const clean = async () => {
    await pool.query('delete from notes where user_id = any($1)', [[ME.id, OTHER.id]]);
    await pool.query('delete from categories where user_id = any($1)', [[ME.id, OTHER.id]]);
  };

  async function category(headers: typeof mine, name: string) {
    const res = await send(headers, 'POST', '/categories', { name });
    return Note.pick({ id: true }).parse(res.json()).id;
  }
  async function draft(body: string, clientId = crypto.randomUUID()) {
    const res = await send(mine, 'POST', '/notes', { body, clientId, today, locale: 'en' });
    return { res, clientId };
  }

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

  it('creates a draft with the scripted suggestion, and a repeated clientId returns it', async () => {
    const work = await category(mine, 'Work');
    const raw = {
      categoryIds: [work],
      newCategories: ['Home'],
      dueDate: '2026-12-01',
      urgency: 'urgent',
    };
    const fresh = createFakeAi([{ value: raw }]);
    const app2 = buildServer({
      db: pool,
      ai: fresh,
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });
    const clientId = crypto.randomUUID();
    const payload = { body: 'pay rent', clientId, today, locale: 'en' };
    const first = await app2.inject({ method: 'POST', url: '/notes', headers: mine, payload });
    expect(first.statusCode).toBe(201);
    const created = NoteCreated.parse(first.json());
    expect(created.note.status).toBe('draft');
    expect(created.note.categoryIds).toEqual([work]);
    expect(created.suggestion.newCategories).toEqual(['Home']);
    expect(created.suggestion.dueDate).toBe('2026-12-01');

    const again = await app2.inject({ method: 'POST', url: '/notes', headers: mine, payload });
    expect(again.statusCode).toBe(200);
    expect(NoteCreated.parse(again.json()).note.id).toBe(created.note.id);
    expect(fresh.calls).toHaveLength(1);
    await app2.close();
  });

  it('stores unread links from a failing link, keeps the draft, and clears them on save', async () => {
    const links = createLinkReader({
      lookup: async () => ['93.184.216.34'],
      fetch: async () => new Response('gone', { status: 404 }),
    });
    const app2 = buildServer({
      db: pool,
      ai: createFakeAi([{ value: {} }]),
      links,
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });
    const body = 'read https://dead.test/a later';
    const res = await app2.inject({
      method: 'POST',
      url: '/notes',
      headers: mine,
      payload: { body, clientId: crypto.randomUUID(), today, locale: 'en' },
    });
    expect(res.statusCode).toBe(201);
    const created = NoteCreated.parse(res.json());
    expect(created.suggestion.unreadLinks).toEqual(['https://dead.test/a']);
    expect(created.note.unreadLinks).toEqual(['https://dead.test/a']);

    const submit = await app2.inject({
      method: 'PATCH',
      url: `/notes/${created.note.id}`,
      headers: mine,
      payload: { status: 'todo', unreadLinks: ['https://dead.test/a'] },
    });
    expect(Note.parse(submit.json()).unreadLinks).toEqual(['https://dead.test/a']);
    const saved = await app2.inject({
      method: 'PATCH',
      url: `/notes/${created.note.id}`,
      headers: mine,
      payload: { unreadLinks: [] },
    });
    expect(Note.parse(saved.json()).unreadLinks).toEqual([]);
    await app2.close();
  });

  it('stores a typed title as typed, else the AI title, else none', async () => {
    const ai2 = createFakeAi([
      { value: { title: 'AI title' } },
      { value: { title: 'AI title' } },
      { fail: 'down' },
    ]);
    const app2 = buildServer({
      db: pool,
      ai: ai2,
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });
    const create = async (extra: object) => {
      const res = await app2.inject({
        method: 'POST',
        url: '/notes',
        headers: mine,
        payload: { body: 'a note', clientId: crypto.randomUUID(), today, locale: 'en', ...extra },
      });
      return NoteCreated.parse(res.json());
    };
    expect((await create({ title: '  My title ' })).note.title).toBe('My title');
    const filled = await create({});
    expect(filled.note.title).toBe('AI title');
    expect(filled.suggestion.title).toBe('AI title');
    expect((await create({})).note.title).toBeNull();
    await app2.close();
  });

  it('sets and clears the title on edit, and rejects one over 200 chars', async () => {
    const id = await submitted('titled');
    const set = await send(mine, 'PATCH', `/notes/${id}`, { title: 'Hello' });
    expect(Note.parse(set.json()).title).toBe('Hello');
    const cleared = await send(mine, 'PATCH', `/notes/${id}`, { title: '' });
    expect(Note.parse(cleared.json()).title).toBeNull();
    const long = await send(mine, 'PATCH', `/notes/${id}`, { title: 'x'.repeat(201) });
    expect(long.statusCode).toBe(400);
    const longCreate = await send(mine, 'POST', '/notes', {
      body: 'x',
      title: 'x'.repeat(201),
      clientId: crypto.randomUUID(),
      today,
      locale: 'en',
    });
    expect(longCreate.statusCode).toBe(400);
  });

  it('still creates a draft when the model fails', async () => {
    const { res } = await draft('buy milk');
    expect(res.statusCode).toBe(201);
    expect(NoteCreated.parse(res.json()).suggestion.categoryIds).toEqual([]);
  });

  it('rejects a bad body and a far-off today', async () => {
    const clientId = crypto.randomUUID();
    expect(
      (await send(mine, 'POST', '/notes', { body: '', clientId, today, locale: 'en' })).statusCode,
    ).toBe(400);
    const res = await send(mine, 'POST', '/notes', {
      body: 'x',
      clientId,
      today: '2000-01-01',
      locale: 'en',
    });
    expect(res.statusCode).toBe(400);
  });

  it('submits in one transaction: creates new taxonomy, links, clears proposed', async () => {
    const { res } = await draft('plan trip');
    const id = NoteCreated.parse(res.json()).note.id;
    const submit = await send(mine, 'PATCH', `/notes/${id}`, {
      status: 'todo',
      newCategories: ['Travel'],
      newTags: [{ categoryName: 'Travel', name: 'Flights' }],
      importance: 'important',
      dueDate: '2026-12-24',
    });
    expect(submit.statusCode).toBe(200);
    const note = Note.parse(submit.json());
    expect(note).toMatchObject({
      status: 'todo',
      proposed: null,
      importance: 'important',
      dueDate: '2026-12-24',
    });
    expect(note.categoryIds).toHaveLength(1);
    expect(note.tagIds).toHaveLength(1);
    const tax = Taxonomy.parse((await send(mine, 'GET', '/taxonomy')).json());
    expect(tax.categories.find((c) => c.name === 'Travel')?.tags.map((t) => t.name)).toEqual([
      'Flights',
    ]);

    const list = NoteList.parse((await send(mine, 'GET', '/notes')).json());
    expect(list.some((n) => n.id === id)).toBe(true);
    expect(NoteList.parse((await send(theirs, 'GET', '/notes')).json())).toEqual([]);
  });

  it('rolls back everything when a submit has an unknown reference', async () => {
    const { res } = await draft('rollback me');
    const id = NoteCreated.parse(res.json()).note.id;
    const bad = await send(mine, 'PATCH', `/notes/${id}`, {
      status: 'todo',
      newCategories: ['Ghosts'],
      newTags: [{ categoryName: 'Nowhere', name: 'x' }],
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: 'unknown_taxonomy' });
    const tax = Taxonomy.parse((await send(mine, 'GET', '/taxonomy')).json());
    expect(tax.categories.some((c) => c.name === 'Ghosts')).toBe(false);
    const note = NoteList.parse((await send(mine, 'GET', '/notes')).json()).find(
      (n) => n.id === id,
    );
    expect(note?.status).toBe('draft');
  });

  it('answers 422 invalid_transition for a draft jumped to done', async () => {
    const { res } = await draft('jump');
    const id = NoteCreated.parse(res.json()).note.id;
    const bad = await send(mine, 'PATCH', `/notes/${id}`, { status: 'done' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: 'invalid_transition' });
  });

  it('answers 422 unknown_taxonomy for another user’s ids and 404 for another user’s note', async () => {
    const theirCategory = await category(theirs, 'Secret');
    const { res } = await draft('mine');
    const id = NoteCreated.parse(res.json()).note.id;
    const bad = await send(mine, 'PATCH', `/notes/${id}`, { categoryIds: [theirCategory] });
    expect(bad.statusCode).toBe(422);
    expect(bad.json()).toEqual({ error: 'unknown_taxonomy' });
    expect((await send(theirs, 'PATCH', `/notes/${id}`, { body: 'hijack' })).statusCode).toBe(404);
  });

  async function submitted(body: string) {
    const id = NoteCreated.parse((await draft(body)).res.json()).note.id;
    await send(mine, 'PATCH', `/notes/${id}`, { status: 'todo' });
    return id;
  }

  it('edits a submitted note, including new names, and steps status one at a time', async () => {
    const id = await submitted('edit me');
    const edit = await send(mine, 'PATCH', `/notes/${id}`, {
      body: 'edited',
      newCategories: ['Fitness'],
      urgency: 'critical',
      importance: 'not_important',
      dueDate: '2026-11-11',
      status: 'in_progress',
    });
    expect(edit.statusCode).toBe(200);
    const note = Note.parse(edit.json());
    expect(note).toMatchObject({
      body: 'edited',
      urgency: 'critical',
      importance: 'not_important',
      dueDate: '2026-11-11',
      status: 'in_progress',
    });
    expect(note.categoryIds).toHaveLength(1);
    const back = await send(mine, 'PATCH', `/notes/${id}`, { status: 'todo' });
    expect(Note.parse(back.json()).status).toBe('todo');
    const jump = await send(mine, 'PATCH', `/notes/${id}`, { status: 'done' });
    expect(jump.statusCode).toBe(422);
    expect(jump.json()).toEqual({ error: 'invalid_transition' });
    const toDraft = await send(mine, 'PATCH', `/notes/${id}`, { status: 'draft' });
    expect(toDraft.statusCode).toBe(422);
  });

  it('soft-deletes, hides from the list, and restores', async () => {
    const id = await submitted('delete me');
    expect((await send(mine, 'DELETE', `/notes/${id}`)).statusCode).toBe(204);
    expect(
      NoteList.parse((await send(mine, 'GET', '/notes')).json()).some((n) => n.id === id),
    ).toBe(false);
    expect((await send(mine, 'DELETE', `/notes/${id}`)).statusCode).toBe(404);
    expect((await send(theirs, 'POST', `/notes/${id}/restore`)).statusCode).toBe(404);
    const restored = await send(mine, 'POST', `/notes/${id}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(Note.parse(restored.json()).id).toBe(id);
    expect(
      NoteList.parse((await send(mine, 'GET', '/notes')).json()).some((n) => n.id === id),
    ).toBe(true);
    expect((await send(theirs, 'DELETE', `/notes/${id}`)).statusCode).toBe(404);
  });

  it('analyze returns a fresh suggestion and writes nothing', async () => {
    const id = await submitted('analyze me');
    const scripted = createFakeAi([{ value: { newCategories: ['Fresh'], urgency: 'urgent' } }]);
    const app2 = buildServer({
      db: pool,
      ai: scripted,
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });
    const res = await app2.inject({
      method: 'POST',
      url: `/notes/${id}/analyze`,
      headers: mine,
      payload: { today, locale: 'en' },
    });
    expect(res.statusCode).toBe(200);
    expect(Suggestion.parse(res.json())).toMatchObject({
      newCategories: ['Fresh'],
      urgency: 'urgent',
    });
    expect(scripted.calls).toHaveLength(1);
    const after = NoteList.parse((await send(mine, 'GET', '/notes')).json()).find(
      (n) => n.id === id,
    );
    expect(after?.urgency).toBeNull();
    expect(after?.proposed).toBeNull();
    const tax = Taxonomy.parse((await send(mine, 'GET', '/taxonomy')).json());
    expect(tax.categories.some((c) => c.name === 'Fresh')).toBe(false);
    expect(
      (await send(theirs, 'POST', `/notes/${id}/analyze`, { today, locale: 'en' })).statusCode,
    ).toBe(404);
    await app2.close();
  });

  describe('voice notes', () => {
    function multipart(
      file: { data: Buffer; type: string } | null,
      fields: Record<string, string>,
    ) {
      const boundary = 'xBOUNDARYx';
      const parts: Buffer[] = [];
      for (const [k, v] of Object.entries(fields)) {
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
          ),
        );
      }
      if (file) {
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice"\r\nContent-Type: ${file.type}\r\n\r\n`,
          ),
          file.data,
          Buffer.from('\r\n'),
        );
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      return {
        payload: Buffer.concat(parts),
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      };
    }
    const upload = (
      file: { data: Buffer; type: string } | null,
      who = mine,
      appUnderTest = app,
      clientId = crypto.randomUUID(),
      extra: Record<string, string> = {},
    ) => {
      const { payload, headers } = multipart(file, { clientId, today, locale: 'en', ...extra });
      return appUnderTest.inject({
        method: 'POST',
        url: '/notes',
        payload,
        headers: { ...who, ...headers },
      });
    };
    const bytes = Buffer.from([1, 2, 3, 4, 5]);

    it('turns the transcript into the draft body and stores the recording', async () => {
      const scripted = createFakeAi([], 'call the dentist');
      const app2 = buildServer({
        db: pool,
        ai: scripted,
        verifyToken,
        allowedEmails: new Set([ME.email, OTHER.email]),
      });
      const res = await upload({ data: bytes, type: 'audio/webm;codecs=opus' }, mine, app2);
      expect(res.statusCode).toBe(201);
      const { note } = NoteCreated.parse(res.json());
      expect(note.body).toBe('call the dentist');
      expect(note.status).toBe('draft');
      expect(note.hasAudio).toBe(true);
      expect(scripted.calls).toHaveLength(1);

      const audio = await send(mine, 'GET', `/notes/${note.id}/audio`);
      expect(audio.statusCode).toBe(200);
      expect(audio.headers['content-type']).toContain('audio/webm');
      expect(audio.rawPayload.equals(bytes)).toBe(true);
      await app2.close();
    });

    it('stores a typed title on a voice note, else the AI title', async () => {
      const scripted = createFakeAi([{ value: { title: 'AI title' } }], 'call the dentist');
      const app2 = buildServer({
        db: pool,
        ai: scripted,
        verifyToken,
        allowedEmails: new Set([ME.email, OTHER.email]),
      });
      const typed = await upload(
        { data: bytes, type: 'audio/webm' },
        mine,
        app2,
        crypto.randomUUID(),
        { title: 'My voice title' },
      );
      expect(NoteCreated.parse(typed.json()).note.title).toBe('My voice title');
      const untyped = await upload({ data: bytes, type: 'audio/webm' }, mine, app2);
      expect(NoteCreated.parse(untyped.json()).note.title).toBe('AI title');
      await app2.close();
    });

    it('returns the same note for a repeated clientId without transcribing again', async () => {
      const clientId = crypto.randomUUID();
      const first = await upload({ data: bytes, type: 'audio/webm' }, mine, app, clientId);
      const again = await upload({ data: bytes, type: 'audio/webm' }, mine, app, clientId);
      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      expect(NoteCreated.parse(again.json()).note.id).toBe(NoteCreated.parse(first.json()).note.id);
    });

    it('rejects an unsupported type, an oversized file and a missing file', async () => {
      expect((await upload({ data: bytes, type: 'text/plain' })).statusCode).toBe(415);
      const big = Buffer.alloc(MAX_AUDIO_BYTES + 1, 1);
      expect((await upload({ data: big, type: 'audio/webm' })).statusCode).toBe(413);
      expect((await upload(null)).statusCode).toBe(400);
    });

    it('answers 400 when a second audio file is sent', async () => {
      const part = (name: string) =>
        `--xBOUNDARYx\r\nContent-Disposition: form-data; name="audio"; filename="${name}"\r\nContent-Type: audio/webm\r\n\r\n`;
      const payload = Buffer.concat([
        Buffer.from(
          `--xBOUNDARYx\r\nContent-Disposition: form-data; name="clientId"\r\n\r\n${crypto.randomUUID()}\r\n`,
        ),
        Buffer.from(part('a')),
        bytes,
        Buffer.from(`\r\n${part('b')}`),
        bytes,
        Buffer.from('\r\n--xBOUNDARYx--\r\n'),
      ]);
      const res = await app.inject({
        method: 'POST',
        url: '/notes',
        headers: { ...mine, 'content-type': 'multipart/form-data; boundary=xBOUNDARYx' },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it('answers 404 for another user, a text note and an unknown id', async () => {
      const res = await upload({ data: bytes, type: 'audio/mpeg' });
      const id = NoteCreated.parse(res.json()).note.id;
      expect((await send(theirs, 'GET', `/notes/${id}/audio`)).statusCode).toBe(404);
      const text = NoteCreated.parse((await draft('typed')).res.json());
      expect((await send(mine, 'GET', `/notes/${text.note.id}/audio`)).statusCode).toBe(404);
      expect((await send(mine, 'GET', `/notes/${crypto.randomUUID()}/audio`)).statusCode).toBe(404);
    });

    it('fails with 502 when transcription throws, and 422 for an empty transcript', async () => {
      const broken = createFakeAi();
      broken.transcribe = async () => {
        throw new Error('groq down');
      };
      const app2 = buildServer({
        db: pool,
        ai: broken,
        verifyToken,
        allowedEmails: new Set([ME.email]),
      });
      expect((await upload({ data: bytes, type: 'audio/webm' }, mine, app2)).statusCode).toBe(502);
      await app2.close();
      const silent = buildServer({
        db: pool,
        ai: createFakeAi([], '  '),
        verifyToken,
        allowedEmails: new Set([ME.email]),
      });
      expect((await upload({ data: bytes, type: 'audio/webm' }, mine, silent)).statusCode).toBe(
        422,
      );
      await silent.close();
    });
  });
});

describe.skipIf(!databaseUrl)('notes outcome logs against the local stack', () => {
  const pool = createPool(databaseUrl ?? '');
  const headers = { authorization: 'Bearer allowed' };
  const clean = async () => {
    await pool.query('delete from notes where user_id = $1', [ME.id]);
    await pool.query('delete from categories where user_id = $1', [ME.id]);
  };
  beforeAll(async () => {
    await pool.query(
      `insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')
       on conflict do nothing`,
      [ME.id, ME.email],
    );
    await clean();
  });
  afterAll(async () => {
    await clean();
    await pool.end();
  });

  it('logs draft saved, draft duplicate, note updated, deleted and restored', async () => {
    const { app, lines } = captureLogs({
      db: pool,
      turns: [{ value: { body: 'x' } }, { value: { body: 'x' } }],
      verifyToken,
      allowedEmails: new Set([ME.email]),
    });
    const payload = {
      body: 'secret note text',
      clientId: crypto.randomUUID(),
      today,
      locale: 'en',
    };
    const first = await app.inject({ method: 'POST', url: '/notes', headers, payload });
    const noteId = first.json().note.id;
    await app.inject({ method: 'POST', url: '/notes', headers, payload });
    await app.inject({
      method: 'PATCH',
      url: `/notes/${noteId}`,
      headers,
      payload: { status: 'todo' },
    });
    await app.inject({ method: 'DELETE', url: `/notes/${noteId}`, headers });
    await app.inject({ method: 'POST', url: `/notes/${noteId}/restore`, headers });
    await app.close();
    expect(lines.find((l) => l.msg === 'draft saved')).toMatchObject({
      noteId,
      links: 0,
      categories: 0,
      tags: 0,
      newCategories: 0,
      newTags: 0,
    });
    expect(lines.find((l) => l.msg === 'draft duplicate')).toMatchObject({ noteId });
    expect(lines.find((l) => l.msg === 'note updated')).toMatchObject({
      noteId,
      from: 'draft',
      to: 'todo',
    });
    expect(lines.find((l) => l.msg === 'note deleted')).toMatchObject({ noteId });
    expect(lines.find((l) => l.msg === 'note restored')).toMatchObject({ noteId });
    expect(JSON.stringify(lines)).not.toContain('secret note text');
  });
});
