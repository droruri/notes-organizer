import { describe, expect, it } from 'vite-plus/test';
import { TRACKED_STATUSES, isOpen, isValidTransition, sortBand, statusClass } from './noteStatus';

describe('isValidTransition', () => {
  it('lets a draft be submitted to todo or to no status, nothing else', () => {
    expect(isValidTransition('draft', 'todo')).toBe(true);
    expect(isValidTransition('draft', null)).toBe(true);
    expect(isValidTransition('draft', 'done')).toBe(false);
    expect(isValidTransition('draft', 'in_progress')).toBe(false);
  });
  it('allows any move among todo, in_progress, done and null', () => {
    const all = [...TRACKED_STATUSES, null] as const;
    for (const from of all) for (const to of all) expect(isValidTransition(from, to)).toBe(true);
  });
  it('never goes back to draft', () => {
    for (const s of ['todo', 'in_progress', 'done', null] as const)
      expect(isValidTransition(s, 'draft')).toBe(false);
  });
});

describe('isOpen, sortBand, statusClass', () => {
  it('treats null as open and in the middle band', () => {
    expect(isOpen(null)).toBe(true);
    expect(isOpen('todo')).toBe(true);
    expect(isOpen('done')).toBe(false);
    expect([sortBand('draft'), sortBand(null), sortBand('todo'), sortBand('done')]).toEqual([
      0, 1, 1, 2,
    ]);
    expect(statusClass(null)).toBe('status-none');
    expect(statusClass('todo')).toBe('status-todo');
  });
});
