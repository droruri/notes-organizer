import { describe, expect, it } from 'vite-plus/test';
import type { Taxonomy } from './index';
import { raiseImportance } from './importance';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const D = '33333333-3333-4333-8333-333333333333';
const taxonomy: Taxonomy = {
  categories: [
    { id: A, name: 'A', deleted: false, importance: 'important', tags: [] },
    { id: B, name: 'B', deleted: false, importance: 'not_important', tags: [] },
    { id: D, name: 'D', deleted: true, importance: 'important', tags: [] },
  ],
};

describe('raiseImportance', () => {
  it('raises null and not_important to important', () => {
    expect(raiseImportance(null, [A], taxonomy)).toBe('important');
    expect(raiseImportance('not_important', [A], taxonomy)).toBe('important');
    expect(raiseImportance(null, [B], taxonomy)).toBe('not_important');
  });
  it('never lowers', () => {
    expect(raiseImportance('important', [B], taxonomy)).toBe('important');
    expect(raiseImportance('not_important', [], taxonomy)).toBe('not_important');
    expect(raiseImportance(null, [], taxonomy)).toBeNull();
  });
  it('ignores deleted and unknown categories', () => {
    expect(raiseImportance(null, [D, 'nope'], taxonomy)).toBeNull();
    expect(raiseImportance('not_important', [D], taxonomy)).toBe('not_important');
  });
});
