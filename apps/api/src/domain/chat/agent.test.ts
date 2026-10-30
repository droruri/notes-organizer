import { describe, expect, it } from 'vite-plus/test';
import type { Db } from '../../db';
import { buildTools, MAX_MESSAGES, MAX_STEPS, chatArgs, proposedAction } from './agent';

const ME = '11111111-1111-4111-8111-111111111111';
const cat = (id: string, name: string) => ({ id, name, deleted: false });
const C1 = 'c1111111-1111-4111-8111-111111111111';
const C2 = 'c2222222-2222-4222-8222-222222222222';
const T1 = 'a1111111-1111-4111-8111-111111111111';
const note = (id: string, o: Record<string, unknown>) => ({
  id,
  clientId: id,
  title: null,
  body: `body ${id}`,
  status: 'todo',
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...o,
});

type Row = { notes: object[]; cats: object[]; tags: object[] };

/** A fake pool that, like the repositories, only returns the rows of the user id in `$1`. */
function fakeDb(rowsByUser: Record<string, Row>, sqls: string[] = []): Db {
  return {
    query: async (sql: string, params: unknown[]) => {
      sqls.push(sql);
      const data = rowsByUser[String(params[0])] ?? { notes: [], cats: [], tags: [] };
      if (/from notes/.test(sql)) return { rows: data.notes };
      if (/from categories/.test(sql)) return { rows: data.cats };
      if (/from tags/.test(sql)) return { rows: data.tags };
      return { rows: [] };
    },
  } as unknown as Db;
}

const OTHER = '99999999-9999-4999-8999-999999999999';
const N1 = 'b1111111-1111-4111-8111-111111111111';
const N2 = 'b2222222-2222-4222-8222-222222222222';
const N3 = 'b3333333-3333-4333-8333-333333333333';
const N4 = 'b4444444-4444-4444-8444-444444444444';
const db = fakeDb({
  [ME]: {
    cats: [cat(C1, 'Work'), cat(C2, 'Home')],
    tags: [{ id: T1, categoryId: C1, name: 'urgent-ish', deleted: false }],
    notes: [
      note(N1, { dueDate: '2026-06-01', categoryIds: [C1], tagIds: [T1] }),
      note(N2, { dueDate: '2026-06-01', status: 'done', categoryIds: [C1] }),
      note(N3, { dueDate: '2026-07-01', categoryIds: [C2] }),
    ],
  },
  [OTHER]: { cats: [], tags: [], notes: [note(N4, {})] },
});
const today = '2026-06-10';
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('chat agent tools', () => {
  it("find_notes only sees the caller's notes", async () => {
    const mine = await buildTools({ db, userId: ME, today }).findNotes({});
    expect(ids(mine)).toEqual([N1, N2, N3].sort());
    const theirs = await buildTools({ db, userId: OTHER, today }).findNotes({});
    expect(ids(theirs)).toEqual([N4]);
  });

  it('find_notes overdue skips done notes and future dues', async () => {
    const rows = await buildTools({ db, userId: ME, today }).findNotes({ overdue: true });
    expect(ids(rows)).toEqual([N1]);
  });

  it('find_notes by category and tag, with names resolved', async () => {
    const t = buildTools({ db, userId: ME, today });
    expect(ids(await t.findNotes({ categoryIds: [C1] }))).toEqual([N1, N2].sort());
    const [row, ...rest] = await t.findNotes({ categoryIds: [C1], tagIds: [T1] });
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ id: N1, categories: ['Work'], tags: ['urgent-ish'] });
  });

  it('find_notes rows include the title', async () => {
    const db2 = fakeDb({ [ME]: { cats: [], tags: [], notes: [note(N1, { title: 'Dentist' })] } });
    const [row] = await buildTools({ db: db2, userId: ME, today }).findNotes({});
    expect(row).toMatchObject({ id: N1, title: 'Dentist' });
  });

  it('list_taxonomy returns usable categories with tags', async () => {
    const list = await buildTools({ db, userId: ME, today }).listTaxonomy();
    expect(list.map((c) => c.name).sort()).toEqual(['Home', 'Work']);
    expect(list.find((c) => c.id === C1)?.tags).toEqual([{ id: T1, name: 'urgent-ish' }]);
  });

  it('has no userId parameter in any tool input', () => {
    const { tools } = buildTools({ db, userId: ME, today });
    expect(JSON.stringify(Object.values(tools).map((t) => t.inputSchema))).not.toMatch(/user_?id/i);
  });

  it('keeps the last 20 messages, 6 steps, and the locale', () => {
    const args = chatArgs(
      { db, userId: ME },
      {
        messages: Array.from({ length: 30 }, (_, i) => ({
          role: 'user' as const,
          content: `${i}`,
        })),
        today,
        locale: 'he',
      },
    );
    expect(args.messages).toHaveLength(MAX_MESSAGES);
    expect(args.maxSteps).toBe(MAX_STEPS);
    expect(args.system).toContain('Hebrew');
  });
});

describe('propose_change', () => {
  const D1 = 'd1111111-1111-4111-8111-111111111111';
  const T2 = 'a2222222-2222-4222-8222-222222222222';
  const sqls: string[] = [];
  const db = fakeDb(
    {
      [ME]: {
        cats: [cat(C1, 'Work'), cat(C2, 'Home'), { id: D1, name: 'Old', deleted: true }],
        tags: [
          { id: T1, categoryId: C1, name: 'urgent-ish', deleted: false },
          { id: T2, categoryId: D1, name: 'gone', deleted: true },
        ],
        notes: [],
      },
    },
    sqls,
  );
  const propose = buildTools({ db, userId: ME, today }).proposeChange;

  it('returns an action for each valid change and never writes', async () => {
    expect(await propose({ action: 'create', kind: 'category', name: ' Money ' })).toEqual({
      action: 'create',
      kind: 'category',
      name: 'Money',
    });
    expect(await propose({ action: 'create', kind: 'tag', categoryId: C1, name: 'x' })).toEqual({
      action: 'create',
      kind: 'tag',
      categoryId: C1,
      categoryName: 'Work',
      name: 'x',
    });
    expect(await propose({ action: 'rename', kind: 'tag', id: T1, name: 'later' })).toEqual({
      action: 'rename',
      kind: 'tag',
      id: T1,
      name: 'urgent-ish',
      newName: 'later',
    });
    expect(await propose({ action: 'delete', kind: 'category', id: C2 })).toMatchObject({
      action: 'delete',
      name: 'Home',
    });
    expect(await propose({ action: 'restore', kind: 'category', id: D1 })).toMatchObject({
      action: 'restore',
      name: 'Old',
    });
    expect(sqls.length).toBeGreaterThan(0);
    expect(sqls.every((q) => /^\s*select/i.test(q))).toBe(true);
  });

  it('rejects what the taxonomy routes would reject', async () => {
    const err = async (i: Parameters<typeof propose>[0]) => propose(i);
    expect(await err({ action: 'create', kind: 'category', name: 'work' })).toEqual({
      error: 'name_taken',
    });
    expect(await err({ action: 'create', kind: 'category', name: '  ' })).toEqual({
      error: 'invalid_name',
    });
    expect(await err({ action: 'create', kind: 'tag', categoryId: D1, name: 'x' })).toEqual({
      error: 'category_deleted',
    });
    expect(await err({ action: 'create', kind: 'tag', categoryId: OTHER, name: 'x' })).toEqual({
      error: 'not_found',
    });
    expect(await err({ action: 'rename', kind: 'category', id: C2, name: 'Work' })).toEqual({
      error: 'name_taken',
    });
    expect(await err({ action: 'delete', kind: 'category', id: D1 })).toEqual({
      error: 'already_deleted',
    });
    expect(await err({ action: 'restore', kind: 'category', id: C1 })).toEqual({
      error: 'not_deleted',
    });
    expect(await err({ action: 'restore', kind: 'tag', id: T2 })).toEqual({
      error: 'category_deleted',
    });
    expect(await err({ action: 'delete', kind: 'tag', id: 'nope' })).toEqual({
      error: 'not_found',
    });
  });

  it('only a valid proposal result becomes a data-actions payload', () => {
    const action = { action: 'delete', kind: 'category', id: C2, name: 'Home' };
    expect(proposedAction({ type: 'tool-output-available', output: action })).toEqual(action);
    expect(proposedAction({ type: 'tool-output-available', output: { error: 'x' } })).toBeNull();
    expect(proposedAction({ type: 'text-delta' })).toBeNull();
  });
});
