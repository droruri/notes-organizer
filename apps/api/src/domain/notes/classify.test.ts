import type { Taxonomy } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { createFakeAi } from '../../ai/provider';
import { buildPrompt, classify, EMPTY_SUGGESTION, mapSuggestion, RawSuggestion } from './classify';

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
      tags: [{ id: T1, categoryId: C1, name: 'Urgent', deleted: false }],
    },
    {
      id: C2,
      name: 'Old',
      deleted: true,
      tags: [{ id: T2, categoryId: C2, name: 'x', deleted: false }],
    },
  ],
};
const raw = (r: object) => RawSuggestion.parse(r);

describe('mapSuggestion', () => {
  it('drops unknown ids and dedupes known ones', () => {
    const s = mapSuggestion(raw({ categoryIds: [C1, C1, 'nope'], tagIds: [T1, 'nope'] }), {
      categories: taxonomy.categories.slice(0, 1),
    });
    expect(s.categoryIds).toEqual([C1]);
    expect(s.tagIds).toEqual([T1]);
  });

  it('links the category of every kept tag', () => {
    const s = mapSuggestion(raw({ tagIds: [T1] }), taxonomy);
    expect(s.categoryIds).toEqual([C1]);
  });

  it('dedupes new names against existing and each other, case-insensitively', () => {
    const s = mapSuggestion(
      raw({
        newCategories: ['work', ' Home ', 'HOME', ''],
        newTags: [
          { categoryId: C1, name: 'urgent' },
          { categoryId: C1, name: 'Fresh' },
          { categoryId: C1, name: 'fresh' },
          { categoryName: 'Home', name: 'Chores' },
          { categoryName: 'Garden', name: 'Weeds' },
          { categoryId: 'unknown', name: 'Lost' },
        ],
      }),
      taxonomy,
    );
    expect(s.newCategories).toEqual(['Home', 'Garden']);
    expect(s.newTags).toEqual([
      { categoryId: C1, name: 'Fresh' },
      { categoryName: 'Home', name: 'Chores' },
      { categoryName: 'Garden', name: 'Weeds' },
    ]);
  });
});

describe('classify', () => {
  const input = { body: 'pay rent', today: '2026-10-25', locale: 'en' as const, taxonomy };

  it('puts body, today, locale and only usable taxonomy in the prompt', () => {
    const { prompt } = buildPrompt({
      ...input,
      taxonomy: { categories: taxonomy.categories.slice(0, 1) },
    });
    expect(prompt).toContain('2026-10-25');
    expect(prompt).toContain(`${C1} | Work | ${T1}:Urgent`);
    expect(prompt).not.toContain('Old');
  });

  it('maps a scripted answer and never offers deleted taxonomy', async () => {
    const ai = createFakeAi([{ value: { categoryIds: [C1, C2], dueDate: '2026-11-01' } }]);
    const s = await classify(ai, input);
    expect(s.categoryIds).toEqual([C1]);
    expect(s.dueDate).toBe('2026-11-01');
    expect(ai.calls[0]?.prompt).not.toContain('Old');
  });

  it('returns an empty suggestion when the call fails or is malformed', async () => {
    expect(await classify(createFakeAi([{ fail: 'boom' }]), input)).toEqual(EMPTY_SUGGESTION);
    expect(await classify(createFakeAi([{ value: { importance: 'huge' } }]), input)).toEqual(
      EMPTY_SUGGESTION,
    );
  });
});
