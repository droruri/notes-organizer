import type { NewTag, Taxonomy } from '@notes/shared';
import { normalizeName } from '../taxonomy/taxonomy';

// Pure note rules: status transitions, link invariants, and which new taxonomy a submit creates.

export type Links = { categoryIds: string[]; tagIds: string[] };

/** `today` is the client's local date; accept it only within a day of the server's UTC date. */
export function isTodayPlausible(today: string, now: Date = new Date()): boolean {
  const day = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(day)) return false;
  const serverDay = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.abs(day - serverDay) <= 24 * 60 * 60 * 1000;
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/**
 * The note's final links. A requested id must be usable (not deleted, parent not deleted) unless
 * the note already has it; picking a tag links its category too. Null = an id is unknown.
 */
export function planLinks(requested: Links, existing: Links, taxonomy: Taxonomy): Links | null {
  const categories = new Map(taxonomy.categories.map((c) => [c.id, c]));
  const tags = new Map(taxonomy.categories.flatMap((c) => c.tags.map((t) => [t.id, t] as const)));
  const categoryIds = unique(requested.categoryIds);
  const tagIds = unique(requested.tagIds);
  for (const id of categoryIds) {
    const category = categories.get(id);
    if (!category || (category.deleted && !existing.categoryIds.includes(id))) return null;
  }
  for (const id of tagIds) {
    const tag = tags.get(id);
    const category = tag && categories.get(tag.categoryId);
    if (!tag || !category) return null;
    if ((tag.deleted || category.deleted) && !existing.tagIds.includes(id)) return null;
    categoryIds.push(category.id);
  }
  return { categoryIds: unique(categoryIds), tagIds };
}

export type NewTaxonomyPlan = {
  /** Names of categories to create (none clash with an active one). */
  categories: string[];
  tags: {
    /** An existing usable category id, or the name of one in `categories`. */
    category: { id: string } | { name: string };
    name: string;
    /** The active tag that already has this name, when there is one: link it instead. */
    existingTagId: string | null;
  }[];
  /** Existing categories that the chosen new names matched: link them. */
  existingCategoryIds: string[];
};

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What submitting `newCategories` / `newTags` creates. Null = a category reference is unknown. */
export function planNewTaxonomy(
  newCategories: string[],
  newTags: NewTag[],
  taxonomy: Taxonomy,
): NewTaxonomyPlan | null {
  const usable = taxonomy.categories.filter((c) => !c.deleted);
  const plan: NewTaxonomyPlan = { categories: [], tags: [], existingCategoryIds: [] };
  for (const raw of newCategories) {
    const name = normalizeName(raw);
    if (name === null) return null;
    const match = usable.find((c) => sameName(c.name, name));
    if (match) plan.existingCategoryIds.push(match.id);
    else if (!plan.categories.some((n) => sameName(n, name))) plan.categories.push(name);
  }
  for (const raw of newTags) {
    const name = normalizeName(raw.name);
    if (name === null) return null;
    let category: { id: string } | { name: string };
    let existingTags: Taxonomy['categories'][number]['tags'] = [];
    if ('categoryId' in raw) {
      const match = usable.find((c) => c.id === raw.categoryId);
      if (!match) return null;
      category = { id: match.id };
      existingTags = match.tags;
    } else {
      const categoryName = normalizeName(raw.categoryName);
      if (categoryName === null) return null;
      const match = usable.find((c) => sameName(c.name, categoryName));
      const created = plan.categories.find((n) => sameName(n, categoryName));
      if (match) {
        category = { id: match.id };
        existingTags = match.tags;
      } else if (created) category = { name: created };
      else return null;
    }
    const existing = existingTags.find((t) => !t.deleted && sameName(t.name, name));
    const duplicate = plan.tags.some(
      (t) =>
        sameName(t.name, name) &&
        ('id' in t.category && 'id' in category
          ? t.category.id === category.id
          : 'name' in t.category && 'name' in category && sameName(t.category.name, category.name)),
    );
    if (!duplicate) plan.tags.push({ category, name, existingTagId: existing?.id ?? null });
  }
  return plan;
}
