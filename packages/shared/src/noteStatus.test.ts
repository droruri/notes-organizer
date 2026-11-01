import { describe, expect, it } from 'vite-plus/test';
import { isOpen, isValidTransition, sortBand, statusClass, statusMoves } from './noteStatus';

describe('statusMoves', () => {
  it('gives one step each way in the flow, none for draft or null', () => {
    expect(statusMoves('todo')).toEqual({ back: null, forward: 'in_progress' });
    expect(statusMoves('in_progress')).toEqual({ back: 'todo', forward: 'done' });
    expect(statusMoves('done')).toEqual({ back: 'in_progress', forward: null });
    expect(statusMoves('draft')).toEqual({ back: null, forward: null });
    expect(statusMoves(null)).toEqual({ back: null, forward: null });
  });
});

describe('isValidTransition', () => {
  it('lets a draft be submitted to todo or to no status, nothing else', () => {
    expect(isValidTransition('draft', 'todo')).toBe(true);
    expect(isValidTransition('draft', null)).toBe(true);
    expect(isValidTransition('draft', 'done')).toBe(false);
    expect(isValidTransition('draft', 'in_progress')).toBe(false);
  });
  it('turns status on only to todo', () => {
    expect(isValidTransition(null, 'todo')).toBe(true);
    expect(isValidTransition(null, 'in_progress')).toBe(false);
    expect(isValidTransition(null, 'done')).toBe(false);
    expect(isValidTransition(null, null)).toBe(true);
  });
  it('turns status off from any flow status', () => {
    for (const s of ['todo', 'in_progress', 'done'] as const)
      expect(isValidTransition(s, null)).toBe(true);
  });
  it('moves one flow step at a time', () => {
    expect(isValidTransition('todo', 'in_progress')).toBe(true);
    expect(isValidTransition('done', 'in_progress')).toBe(true);
    expect(isValidTransition('todo', 'done')).toBe(false);
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
