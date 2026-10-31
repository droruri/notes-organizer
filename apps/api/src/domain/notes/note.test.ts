import type { Taxonomy } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { isTodayPlausible, planLinks, planNewTaxonomy } from './note';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const T1 = '33333333-3333-4333-8333-333333333333';
const T2 = '44444444-4444-4444-8444-444444444444';
const taxonomy: Taxonomy = {
  categories: [
    {
      id: C1,
      name: 'Work',
      deleted: false,
      importance: null,
      color: 'slate',
      tags: [{ id: T1, categoryId: C1, name: 'Urgent', deleted: false }],
    },
    {
      id: C2,
      name: 'Old',
      deleted: true,
      importance: null,
      color: 'slate',
      tags: [{ id: T2, categoryId: C2, name: 'x', deleted: false }],
    },
  ],
};
const none = { categoryIds: [], tagIds: [] };

describe('isTodayPlausible', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  it('accepts within a day and rejects beyond', () => {
    expect(isTodayPlausible('2026-10-24', now)).toBe(true);
    expect(isTodayPlausible('2026-10-26', now)).toBe(true);
    expect(isTodayPlausible('2026-10-27', now)).toBe(false);
    expect(isTodayPlausible('2026-13-45', now)).toBe(false);
  });
});

describe('planLinks', () => {
  it('links a tag’s category', () => {
    expect(planLinks({ categoryIds: [], tagIds: [T1] }, none, taxonomy)).toEqual({
      categoryIds: [C1],
      tagIds: [T1],
    });
  });
  it('rejects unknown ids and new links to deleted taxonomy', () => {
    expect(planLinks({ categoryIds: ['x'], tagIds: [] }, none, taxonomy)).toBeNull();
    expect(planLinks({ categoryIds: [C2], tagIds: [] }, none, taxonomy)).toBeNull();
    expect(planLinks({ categoryIds: [], tagIds: [T2] }, none, taxonomy)).toBeNull();
  });
  it('keeps links that already exist even when deleted', () => {
    const existing = { categoryIds: [C2], tagIds: [T2] };
    expect(planLinks(existing, existing, taxonomy)).toEqual(existing);
  });
});

describe('planNewTaxonomy', () => {
  it('reuses existing names and resolves a new category name', () => {
    const plan = planNewTaxonomy(
      ['work', 'Home'],
      [
        { categoryName: 'Home', name: 'Chores' },
        { categoryId: C1, name: 'urgent' },
      ],
      taxonomy,
    );
    expect(plan?.categories).toEqual(['Home']);
    expect(plan?.existingCategoryIds).toEqual([C1]);
    expect(plan?.tags).toEqual([
      { category: { name: 'Home' }, name: 'Chores', existingTagId: null },
      { category: { id: C1 }, name: 'urgent', existingTagId: T1 },
    ]);
  });
  it('is null for an unknown or deleted category reference', () => {
    expect(planNewTaxonomy([], [{ categoryId: C2, name: 'a' }], taxonomy)).toBeNull();
    expect(planNewTaxonomy([], [{ categoryName: 'Ghost', name: 'a' }], taxonomy)).toBeNull();
  });
});
