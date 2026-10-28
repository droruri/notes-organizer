import {
  EMPTY_FILTER,
  Importance,
  NoteStatus,
  Urgency,
  type NoteFilter,
  type Taxonomy,
} from '@notes/shared';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { Chip } from './Chip';

const toggle = <T,>(list: T[], x: T): T[] =>
  list.includes(x) ? list.filter((y) => y !== x) : [...list, x];

const field = 'field min-h-9 w-auto py-1 text-sm';

/** How many filter fields (besides the search text) are set. */
const activeCount = (filter: NoteFilter) =>
  Object.entries(filter).filter(
    ([key, value]) => key !== 'text' && (Array.isArray(value) ? value.length > 0 : Boolean(value)),
  ).length;

/** Search box plus a collapsible filter sheet. Deleted taxonomy is greyed but still filters. */
export function NoteFilters({
  filter,
  onChange,
  taxonomy,
  sort,
}: {
  filter: NoteFilter;
  onChange: (next: NoteFilter) => void;
  taxonomy: Taxonomy;
  /** The sort control, shown on the toolbar row. */
  sort?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<NoteFilter>) => onChange({ ...filter, ...patch });
  const tags = taxonomy.categories.flatMap((c) => c.tags);
  const date = (label: string, from: 'createdFrom' | 'dueFrom', to: 'createdTo' | 'dueTo') => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-sm font-medium text-muted sm:w-24">{label}</span>
      <input
        type="date"
        aria-label={`${label} — ${t('filters.from')}`}
        value={filter[from]}
        onChange={(e) => set({ [from]: e.target.value })}
        className={field}
      />
      <input
        type="date"
        aria-label={`${label} — ${t('filters.to')}`}
        value={filter[to]}
        onChange={(e) => set({ [to]: e.target.value })}
        className={field}
      />
    </div>
  );
  const group = (label: string, chips: ReactNode) => (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-2 text-sm font-medium text-muted">{label}</legend>
      {chips}
    </fieldset>
  );
  const active = activeCount(filter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={filter.text}
            onChange={(e) => set({ text: e.target.value })}
            aria-label={t('filters.search')}
            placeholder={t('filters.search')}
            className="field ps-10"
          />
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`btn ${open || active > 0 ? 'text-accent' : ''}`}
        >
          <Icon name="filter" size={16} />
          {t('filters.title')}
          {active > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1 text-xs leading-5 text-[var(--accent-fg)] tabular-nums">
              {active}
            </span>
          )}
        </button>
        {sort}
      </div>
      {open && (
        <div className="card enter-fade flex flex-col gap-4 p-4">
          {group(
            t('notes.picker.categories'),
            taxonomy.categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                deleted={c.deleted}
                selected={filter.categoryIds.includes(c.id)}
                onClick={() => set({ categoryIds: toggle(filter.categoryIds, c.id) })}
              />
            )),
          )}
          {group(
            t('filters.tags'),
            tags.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.name}
                deleted={tag.deleted}
                selected={filter.tagIds.includes(tag.id)}
                onClick={() => set({ tagIds: toggle(filter.tagIds, tag.id) })}
              />
            )),
          )}
          {group(
            t('filters.status'),
            NoteStatus.options.map((s) => (
              <Chip
                key={s}
                label={t(`notes.status.${s}`)}
                selected={filter.statuses.includes(s)}
                onClick={() => set({ statuses: toggle(filter.statuses, s) })}
              />
            )),
          )}
          {group(
            t('notes.importance'),
            Importance.options.map((i) => (
              <Chip
                key={i}
                label={t(`notes.importanceValues.${i}`)}
                selected={filter.importances.includes(i)}
                onClick={() => set({ importances: toggle(filter.importances, i) })}
              />
            )),
          )}
          {group(
            t('notes.urgency'),
            Urgency.options.map((u) => (
              <Chip
                key={u}
                label={t(`notes.urgencyValues.${u}`)}
                selected={filter.urgencies.includes(u)}
                onClick={() => set({ urgencies: toggle(filter.urgencies, u) })}
              />
            )),
          )}
          {group(
            t('links.filter'),
            <Chip
              label={t('links.filter')}
              selected={filter.unreadLinksOnly}
              onClick={() => set({ unreadLinksOnly: !filter.unreadLinksOnly })}
            />,
          )}
          {date(t('notes.created'), 'createdFrom', 'createdTo')}
          {date(t('notes.dueDate'), 'dueFrom', 'dueTo')}
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTER)}
            disabled={active === 0 && filter.text === ''}
            className="btn btn-ghost btn-sm self-start text-muted"
          >
            {t('filters.clear')}
          </button>
        </div>
      )}
    </div>
  );
}
