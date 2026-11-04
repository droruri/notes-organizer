import type { Category, Note } from '@notes/shared';

export type RankedCategory = { category: Category; count: number; latest: number };

/**
 * Usable (not deleted) categories ordered by their most recent note activity. Rank = latest
 * `updatedAt` among the notes in that category; ties → open-note count, then name. Categories
 * with no notes go last. `count` is the number of open (not done) notes. Pass the notes already
 * scoped to the workspace.
 */
export function rankCategories(notes: Note[], categories: Category[]): RankedCategory[] {
  const stats = new Map<string, { count: number; latest: number }>();
  for (const n of notes) {
    const time = Date.parse(n.updatedAt);
    for (const id of n.categoryIds) {
      const s = stats.get(id) ?? { count: 0, latest: Number.NEGATIVE_INFINITY };
      if (n.status !== 'done') s.count += 1;
      if (time > s.latest) s.latest = time;
      stats.set(id, s);
    }
  }
  return categories
    .filter((c) => !c.deleted)
    .map((category) => {
      const s = stats.get(category.id);
      return { category, count: s?.count ?? 0, latest: s?.latest ?? Number.NEGATIVE_INFINITY };
    })
    .sort(
      (a, b) =>
        (b.latest === a.latest ? 0 : b.latest > a.latest ? 1 : -1) ||
        b.count - a.count ||
        a.category.name.localeCompare(b.category.name),
    );
}
