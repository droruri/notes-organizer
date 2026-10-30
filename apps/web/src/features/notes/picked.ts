import type { Suggestion } from '@notes/shared';
import type { Picked } from './TaxonomyPicker';

/** A new category starts unselected when an existing one is also suggested: it is an alternative. */
export function pickedFrom(s: Suggestion): Picked {
  const alternative = s.categoryIds.length > 0;
  return {
    categoryIds: s.categoryIds,
    tagIds: s.tagIds,
    newCategories: alternative ? [] : s.newCategories,
    newTags: alternative
      ? s.newTags.filter(
          (tag) => !('categoryName' in tag && s.newCategories.includes(tag.categoryName)),
        )
      : s.newTags,
    offeredCategories: s.newCategories,
    suggestedCategoryIds: s.categoryIds,
  };
}
