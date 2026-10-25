import { describe, expect, it } from 'vite-plus/test';
import type { Db } from '../../db';
import { buildTools, MAX_MESSAGES, MAX_STEPS, chatArgs } from './agent';

const ME = '11111111-1111-4111-8111-111111111111';
const cat = (id: string, name: string) => ({ id, name, deleted: false });
const C1 = 'c1111111-1111-4111-8111-111111111111';
const C2 = 'c2222222-2222-4222-8222-222222222222';
const T1 = 'a1111111-1111-4111-8111-111111111111';
const note = (id: string, o: Record<string, unknown>) => ({
  id,
  clientId: id,
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
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...o,
});

type Row = { notes: object[]; cats: object[]; tags: object[] };

/** A fake pool that, like the repositories, only returns the rows of the user id in `$1`. */
function fakeDb(rowsByUser: Record<string, Row>): Db {
  return {
    query: async (sql: string, params: unknown[]) => {
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
