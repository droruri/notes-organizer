import type { Taxonomy } from './index';
import type { Importance } from './notes';

/**
 * The highest of `current` and the levels of the listed, non-deleted categories
 * (`important` > `not_important` > none). Unknown ids are ignored.
 */
export function raiseImportance(
  current: Importance | null,
  categoryIds: readonly string[],
  taxonomy: Taxonomy,
): Importance | null {
  const levels = taxonomy.categories
    .filter((c) => !c.deleted && categoryIds.includes(c.id))
    .map((c) => c.importance);
  if (current === 'important' || levels.includes('important')) return 'important';
  if (current === 'not_important' || levels.includes('not_important')) return 'not_important';
  return null;
}
