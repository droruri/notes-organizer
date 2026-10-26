import type { ImportConfirm, ImportProposal, NewTag, Suggestion } from '@notes/shared';

// Pure helpers for the import review: derive the name lists from the rows, build the confirm body.

export type Row = ImportProposal['notes'][number];

const lower = (s: string) => s.toLowerCase();
export const categoryKey = (name: string) => lower(name);
export const tagKey = (tag: NewTag) =>
  `${'categoryId' in tag ? tag.categoryId : lower(tag.categoryName)}|${lower(tag.name)}`;

/** The distinct new category and tag names over all rows. */
export function namesOf(rows: Row[]): { categories: string[]; tags: NewTag[] } {
  const categories = new Map<string, string>();
  const tags = new Map<string, NewTag>();
  for (const { suggestion } of rows) {
    for (const name of suggestion.newCategories) categories.set(categoryKey(name), name);
    for (const tag of suggestion.newTags) tags.set(tagKey(tag), tag);
  }
  return { categories: [...categories.values()], tags: [...tags.values()] };
}

export type Excluded = { categories: ReadonlySet<string>; tags: ReadonlySet<string> };

/** A tag under a new category needs that category to be chosen. */
const tagAllowed = (tag: NewTag, excluded: Excluded) =>
  !excluded.tags.has(tagKey(tag)) &&
  ('categoryId' in tag || !excluded.categories.has(categoryKey(tag.categoryName)));

export function buildConfirm(
  rows: Row[],
  selected: ReadonlySet<number>,
  excluded: Excluded,
): ImportConfirm {
  const names = namesOf(rows);
  const keep = (s: Suggestion) => ({
    newCategories: s.newCategories.filter((n) => !excluded.categories.has(categoryKey(n))),
    newTags: s.newTags.filter((t) => tagAllowed(t, excluded)),
  });
  return {
    categories: names.categories.filter((n) => !excluded.categories.has(categoryKey(n))),
    tags: names.tags.filter((t) => tagAllowed(t, excluded)),
    notes: rows.flatMap((row, i) =>
      selected.has(i)
        ? [
            {
              body: row.body,
              title: row.suggestion.title,
              categoryIds: row.suggestion.categoryIds,
              tagIds: row.suggestion.tagIds,
              ...keep(row.suggestion),
              dueDate: row.suggestion.dueDate,
              importance: row.suggestion.importance,
              urgency: row.suggestion.urgency,
              unreadLinks: row.suggestion.unreadLinks,
            },
          ]
        : [],
    ),
  };
}
