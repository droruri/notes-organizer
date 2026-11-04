import { type Category, type Note, type Taxonomy } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { rankCategories } from './categoryRank';
import { buildTitleIndex, suggest } from './suggest';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const T1 = '44444444-4444-4444-8444-444444444444';
const cat = (id: string, name: string, deleted = false) => ({
  id,
  name,
  deleted,
  importance: null,
  color: 'slate' as const,
  pinned: false,
  tags: [] as Taxonomy['categories'][number]['tags'],
});
const taxonomy: Taxonomy = {
  categories: [cat(C1, 'לקוחות'), cat(C2, 'מלקחיים'), { ...cat(C3, 'לקוחות ישנים', true) }],
};
taxonomy.categories[1] = {
  ...cat(C2, 'מלקחיים'),
  tags: [
    { id: T1, categoryId: C2, name: 'לקוח חדש', deleted: false },
    {
      id: '55555555-5555-4555-8555-555555555555',
      categoryId: C2,
      name: 'לקוח מחוק',
      deleted: true,
    },
  ],
};
const note = (i: number, title: string | null, categoryIds: string[] = []): Note =>
  ({
    id: `n${i}`,
    title,
    body: '',
    status: 'open',
    categoryIds,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as unknown as Note;

const run = (q: string, notes: Note[]) => {
  const cats = taxonomy.categories as Category[];
  return suggest(q, {
    titles: buildTitleIndex(notes),
    taxonomy,
    ranked: rankCategories(notes, cats),
  });
};

describe('suggest', () => {
  it('needs at least 2 characters', () => {
    expect(run('ל', [note(1, 'לקוח')])).toEqual({ categories: [], tags: [], notes: [] });
  });

  it('puts word-prefix matches before substring matches, skips deleted taxonomy', () => {
    const r = run('לק', [note(1, 'קלקול'), note(2, 'לקוח גדול')]);
    expect(r.categories.map((c) => c.category.id)).toEqual([C1, C2]);
    expect(r.tags.map((t) => t.tag.id)).toEqual([T1]);
    expect(r.tags[0]?.categoryName).toBe('מלקחיים');
    expect(r.notes.map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('ranks the most used matching category first', () => {
    const notes = [note(1, null, [C1]), note(2, null, [C1])];
    expect(run('לק', notes).categories[0]?.category.id).toBe(C1);
  });

  it('ignores niqqud and case', () => {
    const r = run('lak', [note(1, 'Läk Ünit'), note(2, 'LAKE house'), note(3, 'לָקוֹחַ')]);
    expect(r.notes.map((n) => n.id)).toContain('n2');
    expect(run('לקו', [note(3, 'לָקוֹחַ')]).notes.map((n) => n.id)).toEqual(['n3']);
  });

  it('is fast on 20,000 notes and caps notes at 5', () => {
    const notes = Array.from({ length: 20_000 }, (_, i) => note(i, `פתק מספר ${i} על לקוח`));
    const titles = buildTitleIndex(notes);
    const ctx = { titles, taxonomy, ranked: rankCategories([], taxonomy.categories as Category[]) };
    const start = performance.now();
    const r = suggest('פתק', ctx);
    const noMatch = suggest('zzzz', ctx);
    expect(performance.now() - start).toBeLessThan(20);
    expect(r.notes).toHaveLength(5);
    expect(noMatch.notes).toHaveLength(0);
  });
});
