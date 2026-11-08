import { describe, expect, it } from 'vite-plus/test';
import type { Db } from '../../db';
import {
  buildTools,
  MAX_MESSAGES,
  MAX_STEPS,
  chatArgs,
  listTaxonomy,
  proposedActions,
  ProposeChangeInput,
  ProposeNoteChangesInput,
} from './agent';

const ME = '11111111-1111-4111-8111-111111111111';
const cat = (id: string, name: string) => ({
  id,
  name,
  deleted: false,
  importance: null,
  color: 'slate',
  pinned: false,
});
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
  snoozedUntil: null,
  remindAt: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  checklist: [],
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
const N5 = 'b5555555-5555-4555-8555-555555555555';
const N4 = 'b4444444-4444-4444-8444-444444444444';
const db = fakeDb({
  [ME]: {
    cats: [cat(C1, 'Work'), cat(C2, 'Home')],
    tags: [{ id: T1, categoryId: C1, name: 'urgent-ish', deleted: false }],
    notes: [
      note(N1, {
        dueDate: '2026-06-01',
        categoryIds: [C1],
        tagIds: [T1],
        createdAt: new Date('2026-05-10T12:00:00.000Z'),
      }),
      note(N2, { dueDate: '2026-06-01', status: 'done', categoryIds: [C1] }),
      note(N3, {
        dueDate: '2026-07-01',
        categoryIds: [C2],
        unreadLinks: [{ url: 'https://example.com', title: null }],
      }),
      note(N5, { createdAt: new Date('2026-03-10T12:00:00.000Z') }),
    ],
  },
  [OTHER]: { cats: [], tags: [], notes: [note(N4, {})] },
});
const today = '2026-06-10';
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('chat agent tools', () => {
  it("find_notes only sees the caller's notes", async () => {
    const mine = await buildTools({ db, userId: ME, today }).findNotes({});
    expect(ids(mine)).toEqual([N1, N2, N3, N5].sort());
    const theirs = await buildTools({ db, userId: OTHER, today }).findNotes({});
    expect(ids(theirs)).toEqual([N4]);
  });

  it('find_notes created range is inclusive', async () => {
    const t = buildTools({ db, userId: ME, today });
    expect(ids(await t.findNotes({ createdFrom: '2026-03-10', createdTo: '2026-03-10' }))).toEqual([
      N5,
    ]);
    expect(ids(await t.findNotes({ createdFrom: '2026-05-10', createdTo: '2026-05-10' }))).toEqual([
      N1,
    ]);
  });

  it('find_notes unreadLinksOnly', async () => {
    const t = buildTools({ db, userId: ME, today });
    expect(ids(await t.findNotes({ unreadLinksOnly: true }))).toEqual([N3]);
  });

  it('find_notes due bounds exclude notes without a due date', async () => {
    const t = buildTools({ db, userId: ME, today });
    expect(ids(await t.findNotes({ dueBefore: '2026-06-30' }))).toEqual([N1, N2].sort());
    expect(ids(await t.findNotes({ dueAfter: '2026-06-02' }))).toEqual([N3]);
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

  it('system prompt lists usable taxonomy with ids and colors, and nothing else', async () => {
    const args = await chatArgs({ db, userId: ME }, { messages: [], today, locale: 'en' });
    expect(args.system).toContain(`category ${C1} | Work | slate`);
    expect(args.system).toContain(`${T1}: urgent-ish`);
    const other = await chatArgs(
      { db, userId: 'other-user' },
      { messages: [], today, locale: 'en' },
    );
    expect(other.system).not.toContain(C1);
    expect(Object.keys(args.tools)).not.toContain('list_taxonomy');
  });

  it('system prompt omits deleted categories, tags of deleted categories, and newlines', async () => {
    const D = 'd3333333-3333-4333-8333-333333333333';
    const db3 = fakeDb({
      [ME]: {
        notes: [],
        cats: [
          { ...cat(C1, 'Wo\nrk'), deleted: false },
          { ...cat(D, 'Gone'), deleted: true },
        ],
        tags: [
          { id: T1, categoryId: C1, name: 'ok', deleted: false },
          {
            id: 'e4444444-4444-4444-8444-444444444444',
            categoryId: D,
            name: 'orphan',
            deleted: false,
          },
          {
            id: 'f5555555-5555-4555-8555-555555555555',
            categoryId: C1,
            name: 'dead',
            deleted: true,
          },
        ],
      },
    });
    const { system } = await chatArgs(
      { db: db3, userId: ME },
      { messages: [], today, locale: 'en' },
    );
    expect(system).toContain(`category ${C1} | Wo rk | slate`);
    for (const x of ['Gone', 'orphan', 'dead']) expect(system).not.toContain(x);
  });

  it('list taxonomy returns usable categories with tags', async () => {
    const list = await listTaxonomy(db, ME);
    expect(list.map((c) => c.name).sort()).toEqual(['Home', 'Work']);
    expect(list.find((c) => c.id === C1)?.color).toBe('slate');
    expect(list.find((c) => c.id === C1)?.tags).toEqual([{ id: T1, name: 'urgent-ish' }]);
  });

  it('has no userId parameter in any tool input', () => {
    const { tools } = buildTools({ db, userId: ME, today });
    expect(JSON.stringify(Object.values(tools).map((t) => t.inputSchema))).not.toMatch(/user_?id/i);
  });

  it('keeps the last 20 messages, 6 steps, and the locale', async () => {
    const args = await chatArgs(
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

describe('propose_change tool', () => {
  const schema = ProposeChangeInput;
  const one = { action: 'delete', kind: 'category', id: C2 };

  it('accepts 1–20 changes only', () => {
    expect(schema.safeParse({ changes: [one] }).success).toBe(true);
    expect(schema.safeParse({ changes: [] }).success).toBe(false);
    expect(schema.safeParse({ changes: Array(20).fill(one) }).success).toBe(true);
    expect(schema.safeParse({ changes: Array(21).fill(one) }).success).toBe(false);
  });

  it('only valid proposals in a result become data-actions payloads', () => {
    const action = { action: 'delete', kind: 'category', id: C2, name: 'Home' };
    expect(
      proposedActions({ type: 'tool-output-available', output: [action, { error: 'x' }, action] }),
    ).toEqual([action, action]);
    expect(proposedActions({ type: 'tool-output-available', output: { error: 'x' } })).toEqual([]);
    expect(proposedActions({ type: 'text-delta' })).toEqual([]);
  });
});

describe('propose_note_changes tool', () => {
  const note = {
    action: 'update',
    kind: 'note',
    id: C1,
    name: 'Dentist',
    edit: { status: 'done' },
    labels: { categories: [], tags: [] },
  };

  it('accepts 1–20 changes only', () => {
    const one = { noteId: C1, status: 'done' };
    expect(ProposeNoteChangesInput.safeParse({ changes: [one] }).success).toBe(true);
    expect(ProposeNoteChangesInput.safeParse({ changes: [] }).success).toBe(false);
    expect(ProposeNoteChangesInput.safeParse({ changes: Array(21).fill(one) }).success).toBe(false);
  });

  it('a note action survives the stream filter next to errors', () => {
    expect(
      proposedActions({ type: 'tool-output-available', output: [note, { error: 'draft' }] }),
    ).toEqual([note]);
  });
});
