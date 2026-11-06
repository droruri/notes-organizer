import Fastify from 'fastify';
import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { Db } from '../../db';
import { registerRequestLogging } from '../../requestLog';
import { proposeNoteChanges, proposeTaxonomyChanges } from './proposals';

const N1 = 'b1111111-1111-4111-8111-111111111111';
const N2 = 'b2222222-2222-4222-8222-222222222222';
const N3 = 'b3333333-3333-4333-8333-333333333333';
const mockNote = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id.slice(0, 2)}`,
  body: 'secret body',
  status: 'todo',
  dueDate: null,
  snoozedUntil: null,
  importance: null,
  urgency: null,
  categoryIds: [C1],
  tagIds: [],
  ...over,
});
vi.mock('../notes/repository', () => ({
  listNotes: async () => [
    mockNote(N1),
    mockNote(N2, { status: 'draft' }),
    mockNote(N3, { status: 'done', categoryIds: [C1, C2], tagIds: [T1] }),
  ],
}));

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const C1 = 'c1111111-1111-4111-8111-111111111111';
const C2 = 'c2222222-2222-4222-8222-222222222222';
const C3 = 'c3333333-3333-4333-8333-333333333333';
const C4 = 'c4444444-4444-4444-8444-444444444444';
const D1 = 'd1111111-1111-4111-8111-111111111111';
const T1 = 'a1111111-1111-4111-8111-111111111111';
const T2 = 'a2222222-2222-4222-8222-222222222222';
const cat = (id: string, name: string, color = 'slate') => ({
  id,
  name,
  deleted: false,
  importance: null,
  color,
  pinned: false,
});

function makeDb(sqls: string[] = []): Db {
  const cats = [
    cat(C1, 'Work'),
    cat(C2, 'Home'),
    cat(C3, 'Fun'),
    cat(C4, 'Money'),
    { ...cat(D1, 'Old'), deleted: true },
  ];
  const tags = [
    { id: T1, categoryId: C1, name: 'urgent-ish', deleted: false },
    { id: T2, categoryId: D1, name: 'gone', deleted: true },
  ];
  return {
    query: async (sql: string) => {
      sqls.push(sql);
      if (/from categories/.test(sql)) return { rows: cats };
      if (/from tags/.test(sql)) return { rows: tags };
      return { rows: [] };
    },
  } as unknown as Db;
}

const recolor = (id: string, color: 'blue' | 'red' | 'pink' | 'teal') =>
  ({ action: 'recolor', kind: 'category', id, color }) as const;

describe('proposeTaxonomyChanges', () => {
  it('returns one action per recolor, in order, with one read and only selects', async () => {
    const sqls: string[] = [];
    const out = await proposeTaxonomyChanges(makeDb(sqls), ME, [
      recolor(C1, 'blue'),
      recolor(C2, 'red'),
      recolor(C3, 'pink'),
      recolor(C4, 'teal'),
    ]);
    expect(
      out.map((o) => ('error' in o ? o.error : o.action === 'recolor' ? o.name : '?')),
    ).toEqual(['Work', 'Home', 'Fun', 'Money']);
    expect(sqls.filter((q) => /from categories/.test(q))).toHaveLength(1);
    expect(sqls.every((q) => /^\s*select/i.test(q))).toBe(true);
  });

  it('keeps every rejection case per input in a mixed batch', async () => {
    const out = await proposeTaxonomyChanges(makeDb(), ME, [
      { action: 'create', kind: 'category', name: ' Money2 ' },
      { action: 'create', kind: 'category', name: 'work' },
      { action: 'create', kind: 'category', name: '  ' },
      { action: 'create', kind: 'tag', categoryId: D1, name: 'x' },
      { action: 'create', kind: 'tag', categoryId: OTHER, name: 'x' },
      { action: 'rename', kind: 'category', id: C2, name: 'Work' },
      { action: 'delete', kind: 'category', id: D1 },
      { action: 'restore', kind: 'category', id: C1 },
      { action: 'restore', kind: 'tag', id: T2 },
      { action: 'delete', kind: 'tag', id: 'nope' },
      { action: 'recolor', kind: 'tag', id: T1, color: 'blue' },
      { action: 'recolor', kind: 'category', id: D1, color: 'blue' },
      { action: 'recolor', kind: 'category', id: C1 },
      { action: 'recolor', kind: 'category', id: C1, color: 'slate' },
      { action: 'rename', kind: 'tag', id: T1, name: 'later' },
    ]);
    expect(out.map((o) => ('error' in o ? o.error : o.action))).toEqual([
      'create',
      'name_taken',
      'invalid_name',
      'category_deleted',
      'not_found',
      'name_taken',
      'already_deleted',
      'not_deleted',
      'category_deleted',
      'not_found',
      'invalid_kind',
      'category_deleted',
      'invalid_color',
      'unchanged',
      'rename',
    ]);
    expect(out[0]).toEqual({ action: 'create', kind: 'category', name: 'Money2' });
  });

  it('logs the outcome and a warn per rejected input, without names', async () => {
    const lines: Record<string, unknown>[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _e, cb) {
        for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l));
        cb();
      },
    });
    const app = Fastify({ logger: { level: 'debug', stream } });
    registerRequestLogging(app);
    app.get('/t', async () =>
      proposeTaxonomyChanges(makeDb(), ME, [
        recolor(C1, 'blue'),
        { action: 'delete', kind: 'category', id: 'nope' },
        { action: 'create', kind: 'category', name: 'work' },
      ]),
    );
    await app.inject({ method: 'GET', url: '/t' });
    expect(lines.find((l) => l.msg === 'taxonomy changes proposed')).toMatchObject({
      proposed: 1,
      rejected: 2,
    });
    const warns = lines.filter((l) => l.msg === 'proposal rejected');
    expect(warns).toMatchObject([
      { index: 1, error: 'not_found' },
      { index: 2, error: 'name_taken' },
    ]);
    expect(JSON.stringify(lines)).not.toContain('Work');
  });
});

describe('proposeNoteChanges', () => {
  it('builds note actions with full lists and labels, reading only', async () => {
    const sqls: string[] = [];
    const out = await proposeNoteChanges(makeDb(sqls), ME, [
      {
        noteId: N1,
        status: 'done',
        dueDate: '2026-11-13',
        importance: 'important',
        urgency: 'urgent',
      },
      { noteId: N1, addCategoryIds: [C2], addTagIds: [T1] },
      { noteId: N3, removeCategoryIds: [C1], removeTagIds: [T1], status: null },
    ]);
    expect(out[0]).toEqual({
      action: 'update',
      kind: 'note',
      id: N1,
      name: 'Title b1',
      edit: { status: 'done', dueDate: '2026-11-13', importance: 'important', urgency: 'urgent' },
      labels: { categories: [], tags: [] },
    });
    expect(out[1]).toMatchObject({
      edit: { categoryIds: [C1, C2], tagIds: [T1] },
      labels: { categories: ['Work', 'Home'], tags: ['urgent-ish'] },
    });
    expect(out[2]).toMatchObject({
      edit: { status: null, categoryIds: [C2], tagIds: [] },
      labels: { categories: ['Home'], tags: [] },
    });
    expect(sqls.length).toBeGreaterThan(0);
    expect(sqls.every((q) => /^\s*select/i.test(q))).toBe(true);
  });

  it('rejects each bad input with its code', async () => {
    const out = await proposeNoteChanges(makeDb(), ME, [
      { noteId: 'nope', status: 'done' },
      { noteId: N2, status: 'done' },
      { noteId: N1, status: 'draft' },
      { noteId: N1, addCategoryIds: [D1] },
      { noteId: N1, addTagIds: [T2] },
      { noteId: N1, addCategoryIds: ['zzz'] },
      { noteId: N1, status: 'todo', addCategoryIds: [C1] },
      { noteId: N1 },
    ]);
    expect(out.map((o) => ('error' in o ? o.error : o.action))).toEqual([
      'not_found',
      'draft',
      'invalid_transition',
      'unknown_taxonomy',
      'unknown_taxonomy',
      'unknown_taxonomy',
      'unchanged',
      'unchanged',
    ]);
  });

  it('logs the outcome and a warn per rejected input, ids only', async () => {
    const lines: Record<string, unknown>[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _e, cb) {
        for (const l of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(l));
        cb();
      },
    });
    const app = Fastify({ logger: { level: 'debug', stream } });
    registerRequestLogging(app);
    app.get('/t', async () =>
      proposeNoteChanges(makeDb(), ME, [
        { noteId: N1, status: 'done' },
        { noteId: N2, status: 'done' },
        { noteId: 'nope', status: 'done' },
      ]),
    );
    await app.inject({ method: 'GET', url: '/t' });
    expect(lines.find((l) => l.msg === 'note changes proposed')).toMatchObject({
      proposed: 1,
      rejected: 2,
    });
    expect(lines.filter((l) => l.msg === 'note proposal rejected')).toMatchObject([
      { index: 1, noteId: N2, error: 'draft' },
      { index: 2, error: 'not_found' },
    ]);
    expect(JSON.stringify(lines)).not.toContain('nope');
    expect(JSON.stringify(lines)).not.toContain('secret body');
    expect(JSON.stringify(lines)).not.toContain('Title b1');
  });
});
