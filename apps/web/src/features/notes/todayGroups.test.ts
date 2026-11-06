import type { Note } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { todayCount, todayGroups } from './todayGroups';

const TODAY = '2026-11-10';
let seq = 0;
const note = (o: Partial<Note> = {}): Note => {
  seq += 1;
  return {
    id: `id-${seq}`,
    clientId: `c-${seq}`,
    title: null,
    body: 'x',
    status: 'todo',
    workspaceId: '00000000-0000-4000-8000-0000000000f1',
    importance: null,
    urgency: null,
    dueDate: null,
    snoozedUntil: null,
    proposed: null,
    unreadLinks: [],
    categoryIds: [],
    tagIds: [],
    hasAudio: false,
    attachments: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...o,
  };
};
const ids = (ns: Note[]) => ns.map((n) => n.id);

describe('todayGroups snooze', () => {
  it('skips notes snoozed past today but keeps those waking today', () => {
    const hidden = note({ dueDate: TODAY, snoozedUntil: '2026-11-11' });
    const awake = note({ dueDate: TODAY, snoozedUntil: TODAY });
    expect(ids(todayGroups([hidden, awake], TODAY, 'urgency').dueToday)).toEqual([awake.id]);
  });
});

describe('todayGroups', () => {
  it('excludes drafts and done notes', () => {
    const g = todayGroups(
      [
        note({ status: 'draft', dueDate: TODAY }),
        note({ status: 'done', dueDate: '2026-11-01' }),
        note({ status: 'done', dueDate: TODAY }),
      ],
      TODAY,
      'newest',
    );
    expect(todayCount(g)).toBe(0);
  });

  it('shows a note once, in the first matching section', () => {
    const n = note({ status: 'in_progress', dueDate: '2026-11-01' });
    const g = todayGroups([n], TODAY, 'newest');
    expect(ids(g.overdue)).toEqual([n.id]);
    expect(g.inProgress).toEqual([]);
    expect(todayCount(g)).toBe(1);
  });

  it('counts a null-status note with a due date, and in-progress without one', () => {
    const a = note({ status: null, dueDate: TODAY });
    const b = note({ status: 'in_progress' });
    const g = todayGroups([a, b], TODAY, 'newest');
    expect(ids(g.dueToday)).toEqual([a.id]);
    expect(ids(g.inProgress)).toEqual([b.id]);
  });

  it('includes due today+7, excludes today+8 and undated todos', () => {
    const in7 = note({ dueDate: '2026-11-17' });
    const in8 = note({ dueDate: '2026-11-18' });
    const none = note();
    const g = todayGroups([in7, in8, none], TODAY, 'newest');
    expect(g.upcoming.map((u) => u.date)).toEqual(['2026-11-17']);
    expect(todayCount(g)).toBe(1);
  });

  it('groups upcoming by date ascending', () => {
    const a = note({ dueDate: '2026-11-15' });
    const b = note({ dueDate: '2026-11-12' });
    const c = note({ dueDate: '2026-11-15' });
    const g = todayGroups([a, b, c], TODAY, 'newest');
    expect(g.upcoming.map((u) => u.date)).toEqual(['2026-11-12', '2026-11-15']);
    expect(g.upcoming[1]?.notes).toHaveLength(2);
  });

  it('sorts overdue oldest due first', () => {
    const late = note({ dueDate: '2026-11-08' });
    const early = note({ dueDate: '2026-11-01' });
    const g = todayGroups([late, early], TODAY, 'newest');
    expect(ids(g.overdue)).toEqual([early.id, late.id]);
  });

  it('rolls over month and year', () => {
    const jan = note({ dueDate: '2027-01-04' });
    const late = note({ dueDate: '2027-01-05' });
    const g = todayGroups([jan, late], '2026-12-28', 'newest');
    expect(g.upcoming.map((u) => u.date)).toEqual(['2027-01-04']);
  });

  it('puts a null-status note with a past due date in overdue', () => {
    const a = note({ status: null, dueDate: '2026-11-01' });
    const g = todayGroups([a], TODAY, 'newest');
    expect(ids(g.overdue)).toEqual([a.id]);
  });

  it('keeps an in-progress note with a future due date in in progress, not upcoming', () => {
    const a = note({ status: 'in_progress', dueDate: '2026-11-12' });
    const g = todayGroups([a], TODAY, 'newest');
    expect(ids(g.inProgress)).toEqual([a.id]);
    expect(g.upcoming).toEqual([]);
  });
});
