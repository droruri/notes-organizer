import { EMPTY_FILTER, type Taxonomy } from '@notes/shared';
import '../../lib/i18n';
import i18n from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import { describeFilter } from './describeFilter';

const C = '11111111-1111-4111-8111-111111111111';
const G = '33333333-3333-4333-8333-333333333333';
const taxonomy: Taxonomy = {
  categories: [{ id: C, name: 'עבודה', deleted: true, importance: null, color: 'blue', tags: [] }],
};
const t = i18n.t.bind(i18n);

describe('describeFilter', () => {
  it('is empty for the empty filter and ignores the search text', () => {
    expect(describeFilter({ ...EMPTY_FILTER, text: 'x' }, taxonomy, t)).toEqual([]);
  });

  it('shows a category with its color, greyed when deleted, and removes only it', () => {
    const f = { ...EMPTY_FILTER, categoryIds: [C], statuses: ['done' as const] };
    const chips = describeFilter(f, taxonomy, t);
    expect(chips[0]).toMatchObject({ label: 'עבודה', color: 'blue', deleted: true });
    expect(chips[0]?.remove(f)).toEqual({ ...f, categoryIds: [] });
  });

  it('reads a date range and clears both ends', () => {
    const f = { ...EMPTY_FILTER, createdFrom: '2025-10-01', createdTo: '2025-10-31' };
    const [chip] = describeFilter(f, taxonomy, t);
    expect(chip?.label).toBe('נוצר: 1.10–31.10');
    expect(chip?.remove(f)).toEqual(EMPTY_FILTER);
  });

  it('skips unknown ids', () => {
    expect(describeFilter({ ...EMPTY_FILTER, categoryIds: [G], tagIds: [G] }, taxonomy, t)).toEqual(
      [],
    );
  });
});
