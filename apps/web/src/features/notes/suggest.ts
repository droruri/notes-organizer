import { normalizeText, type Note, type Tag, type Taxonomy } from '@notes/shared';
import type { RankedCategory } from './categoryRank';

export const MIN_QUERY = 2;
const MAX_CATEGORIES = 3;
const MAX_TAGS = 3;
export const MAX_NOTES = 5;

/** Note titles normalized once per notes change, so a keystroke only scans strings. */
export type TitleIndex = { id: string; title: string; norm: string }[];

export const buildTitleIndex = (notes: Note[]): TitleIndex =>
  notes.flatMap((n) => {
    const title = n.title?.trim() ?? '';
    return title === '' ? [] : [{ id: n.id, title, norm: normalizeText(title) }];
  });

export type TagSuggestion = { tag: Tag; categoryName: string };
export type Suggestions = {
  categories: RankedCategory[];
  tags: TagSuggestion[];
  notes: { id: string; title: string }[];
};

/** 0 = a word starts with the query, 1 = it appears inside a word, -1 = no match. */
const rank = (norm: string, q: string): number => {
  const at = norm.indexOf(q);
  if (at < 0) return -1;
  return at === 0 || norm.includes(` ${q}`) ? 0 : 1;
};

/** Takes matches ordered word-prefix first, then substring; each group keeps its input order. */
function pick<T>(items: Iterable<T>, norm: (x: T) => string, q: string, max: number): T[] {
  const prefix: T[] = [];
  const inside: T[] = [];
  for (const item of items) {
    const r = rank(norm(item), q);
    if (r === 0) {
      prefix.push(item);
      if (prefix.length >= max) break;
    } else if (r === 1 && inside.length < max) inside.push(item);
  }
  return [...prefix, ...inside].slice(0, max);
}

/** Instant, on-device suggestions: usable categories (as ranked), tags, then note titles. */
export function suggest(
  query: string,
  ctx: { titles: TitleIndex; taxonomy: Taxonomy; ranked: RankedCategory[] },
): Suggestions {
  const q = normalizeText(query.trim());
  if (q.length < MIN_QUERY) return { categories: [], tags: [], notes: [] };
  const categories = pick(ctx.ranked, (r) => normalizeText(r.category.name), q, MAX_CATEGORIES);
  const tagPool: (TagSuggestion & { norm: string })[] = [];
  for (const c of ctx.taxonomy.categories) {
    if (c.deleted) continue;
    for (const tag of c.tags)
      if (!tag.deleted) tagPool.push({ tag, categoryName: c.name, norm: normalizeText(tag.name) });
  }
  const tags = pick(tagPool, (x) => x.norm, q, MAX_TAGS).map(({ tag, categoryName }) => ({
    tag,
    categoryName,
  }));
  const notes = pick(ctx.titles, (x) => x.norm, q, MAX_NOTES).map(({ id, title }) => ({
    id,
    title,
  }));
  return { categories, tags, notes };
}
