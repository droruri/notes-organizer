import { describe, expect, it } from 'vite-plus/test';
import type { Note } from './index';
import { EMPTY_FILTER, filterNotes, isOverdue, sortNotes } from './noteQuery';

const TODAY = '2026-10-25';
let seq = 0;
const note = (o: Partial<Note> = {}): Note => {
  seq += 1;
  return {
    id: `id-${seq}`,
    clientId: `c-${seq}`,
    body: 'x',
    status: 'todo',
    importance: null,
    urgency: null,
    dueDate: null,
    proposed: null,
    categoryIds: [],
    tagIds: [],
    hasAudio: false,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...o,
  };
};
const ids = (ns: Note[]) => ns.map((n) => n.id);
const f = (o: Partial<typeof EMPTY_FILTER>) => ({ ...EMPTY_FILTER, ...o });

describe('isOverdue', () => {
  it('is false on the due day and true the day after', () => {
    expect(isOverdue({ dueDate: TODAY, status: 'todo' }, TODAY)).toBe(false);
    expect(isOverdue({ dueDate: '2026-10-24', status: 'todo' }, TODAY)).toBe(true);
  });
  it('is false without a due date or when done', () => {
    expect(isOverdue({ dueDate: null, status: 'todo' }, TODAY)).toBe(false);
    expect(isOverdue({ dueDate: '2026-01-01', status: 'done' }, TODAY)).toBe(false);
  });
});

describe('filterNotes', () => {
  it('matches text ignoring case and niqqud', () => {
    const a = note({ body: 'Buy Milk' });
    const b = note({ body: 'שָׁלוֹם עולם' });
    const c = note({ body: 'other' });
    expect(ids(filterNotes([a, b, c], f({ text: 'milk' }), TODAY))).toEqual([a.id]);
    expect(ids(filterNotes([a, b, c], f({ text: 'שלום' }), TODAY))).toEqual([b.id]);
    expect(ids(filterNotes([a, b, c], f({ text: 'שָׁלוֹם' }), TODAY))).toEqual([b.id]);
  });
  it('filters by category, tag, status, importance and urgency', () => {
    const a = note({
      categoryIds: ['c1'],
      tagIds: ['t1'],
      status: 'done',
      importance: 'important',
      urgency: 'urgent',
    });
    const b = note({ categoryIds: ['c2'] });
    expect(ids(filterNotes([a, b], f({ categoryIds: ['c1'] }), TODAY))).toEqual([a.id]);
    expect(ids(filterNotes([a, b], f({ tagIds: ['t1'] }), TODAY))).toEqual([a.id]);
    expect(ids(filterNotes([a, b], f({ statuses: ['done'] }), TODAY))).toEqual([a.id]);
    expect(ids(filterNotes([a, b], f({ importances: ['important'] }), TODAY))).toEqual([a.id]);
    expect(ids(filterNotes([a, b], f({ urgencies: ['urgent'] }), TODAY))).toEqual([a.id]);
    expect(filterNotes([a, b], EMPTY_FILTER, TODAY)).toHaveLength(2);
  });
  it('filters created and due ranges inclusively', () => {
    const a = note({ createdAt: '2026-10-05T12:00:00.000Z', dueDate: '2026-11-01' });
    const b = note({ createdAt: '2026-10-10T12:00:00.000Z' });
    expect(ids(filterNotes([a, b], f({ createdFrom: '2026-10-06' }), TODAY))).toEqual([b.id]);
    expect(ids(filterNotes([a, b], f({ createdTo: '2026-10-05' }), TODAY))).toEqual([a.id]);
    expect(
      ids(filterNotes([a, b], f({ dueFrom: '2026-11-01', dueTo: '2026-11-01' }), TODAY)),
    ).toEqual([a.id]);
    expect(filterNotes([a, b], f({ dueTo: '2026-12-01' }), TODAY)).toEqual([a]);
  });
});

describe('sortNotes', () => {
  it('orders by urgency, importance, due date, newest', () => {
    const none = note({ createdAt: '2026-10-02T00:00:00Z' });
    const notCritical = note({ urgency: 'not_critical' });
    const medium = note({ urgency: 'medium' });
    const critical = note({ urgency: 'critical' });
    const urgentLate = note({ urgency: 'urgent', dueDate: '2026-12-01' });
    const urgentNoDue = note({ urgency: 'urgent' });
    const urgentOverdue = note({ urgency: 'urgent', dueDate: '2026-10-01' });
    const urgentImportant = note({
      urgency: 'urgent',
      importance: 'important',
      dueDate: '2027-01-01',
    });
    const urgentNewer = note({ urgency: 'urgent', createdAt: '2026-10-03T00:00:00Z' });
    const sorted = sortNotes(
      [
        none,
        notCritical,
        medium,
        critical,
        urgentLate,
        urgentNoDue,
        urgentOverdue,
        urgentImportant,
        urgentNewer,
      ],
      'urgency',
      TODAY,
    );
    expect(ids(sorted)).toEqual(
      ids([
        urgentImportant,
        urgentOverdue,
        urgentLate,
        urgentNewer,
        urgentNoDue,
        critical,
        medium,
        notCritical,
        none,
      ]),
    );
  });
  it('puts drafts on top and done at the bottom for every sort', () => {
    const draft = note({ status: 'draft', createdAt: '2020-01-01T00:00:00Z' });
    const done = note({ status: 'done', urgency: 'urgent', createdAt: '2030-01-01T00:00:00Z' });
    const mid = note({});
    for (const s of ['urgency', 'due_date', 'newest', 'oldest'] as const) {
      expect(ids(sortNotes([done, mid, draft], s, TODAY))).toEqual(ids([draft, mid, done]));
    }
  });
  it('sorts by due date, newest and oldest', () => {
    const late = note({ dueDate: '2026-12-01', createdAt: '2026-10-02T00:00:00Z' });
    const overdue = note({ dueDate: '2026-10-01', createdAt: '2026-10-03T00:00:00Z' });
    const none = note({ createdAt: '2026-10-01T00:00:00Z' });
    expect(ids(sortNotes([none, late, overdue], 'due_date', TODAY))).toEqual(
      ids([overdue, late, none]),
    );
    expect(ids(sortNotes([none, late, overdue], 'newest', TODAY))).toEqual(
      ids([overdue, late, none]),
    );
    expect(ids(sortNotes([overdue, late, none], 'oldest', TODAY))).toEqual(
      ids([none, late, overdue]),
    );
  });
});
