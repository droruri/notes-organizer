import type { CategoryColor, NoteFilter, Taxonomy } from '@notes/shared';
import { EMPTY_FILTER } from '@notes/shared';
import type { TFunction } from 'i18next';

export type FilterChip = {
  key: string;
  label: string;
  color?: CategoryColor;
  /** Soft-deleted taxonomy: shown greyed. */
  deleted?: boolean;
  /** The filter with just this value removed. */
  remove: (f: NoteFilter) => NoteFilter;
};

/** `2025-10-01` → `1.10`. */
const short = (iso: string) => {
  const [, m, d] = iso.split('-');
  return m && d ? `${Number(d)}.${Number(m)}` : iso;
};

const range = (label: string, from: string, to: string, t: TFunction) => {
  if (from && to) return t('filters.chipRange', { label, from: short(from), to: short(to) });
  if (from) return `${label}: ${t('filters.chipFrom', { date: short(from) })}`;
  return `${label}: ${t('filters.chipTo', { date: short(to) })}`;
};

/** One removable chip per active filter value. The search text is not a chip. Unknown ids show nothing. */
export function describeFilter(filter: NoteFilter, taxonomy: Taxonomy, t: TFunction): FilterChip[] {
  const chips: FilterChip[] = [];
  const categories = new Map(taxonomy.categories.map((c) => [c.id, c]));
  const tags = new Map(taxonomy.categories.flatMap((c) => c.tags).map((x) => [x.id, x]));

  for (const id of filter.categoryIds) {
    const c = categories.get(id);
    if (!c) continue;
    chips.push({
      key: `category:${id}`,
      label: c.name,
      color: c.color,
      deleted: c.deleted,
      remove: (f) => ({ ...f, categoryIds: f.categoryIds.filter((x) => x !== id) }),
    });
  }
  for (const id of filter.tagIds) {
    const tag = tags.get(id);
    if (!tag) continue;
    chips.push({
      key: `tag:${id}`,
      label: `#${tag.name}`,
      deleted: tag.deleted,
      remove: (f) => ({ ...f, tagIds: f.tagIds.filter((x) => x !== id) }),
    });
  }
  for (const s of filter.statuses)
    chips.push({
      key: `status:${s}`,
      label: t(`notes.status.${s}`),
      remove: (f) => ({ ...f, statuses: f.statuses.filter((x) => x !== s) }),
    });
  for (const i of filter.importances)
    chips.push({
      key: `importance:${i}`,
      label: t(`notes.importanceValues.${i}`),
      remove: (f) => ({ ...f, importances: f.importances.filter((x) => x !== i) }),
    });
  for (const u of filter.urgencies)
    chips.push({
      key: `urgency:${u}`,
      label: t(`notes.urgencyValues.${u}`),
      remove: (f) => ({ ...f, urgencies: f.urgencies.filter((x) => x !== u) }),
    });
  if (filter.createdFrom || filter.createdTo)
    chips.push({
      key: 'created',
      label: range(t('notes.created'), filter.createdFrom, filter.createdTo, t),
      remove: (f) => ({
        ...f,
        createdFrom: EMPTY_FILTER.createdFrom,
        createdTo: EMPTY_FILTER.createdTo,
      }),
    });
  if (filter.dueFrom || filter.dueTo)
    chips.push({
      key: 'due',
      label: range(t('notes.dueDate'), filter.dueFrom, filter.dueTo, t),
      remove: (f) => ({ ...f, dueFrom: EMPTY_FILTER.dueFrom, dueTo: EMPTY_FILTER.dueTo }),
    });
  if (filter.unreadLinksOnly)
    chips.push({
      key: 'unreadLinks',
      label: t('links.filter'),
      remove: (f) => ({ ...f, unreadLinksOnly: false }),
    });
  return chips;
}
