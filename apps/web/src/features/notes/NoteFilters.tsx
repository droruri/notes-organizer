import {
  EMPTY_FILTER,
  Importance,
  NoteStatus,
  Urgency,
  type NoteFilter,
  type Taxonomy,
} from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip } from './Chip';

const toggle = <T,>(list: T[], x: T): T[] =>
  list.includes(x) ? list.filter((y) => y !== x) : [...list, x];

const field = 'rounded-md border border-line bg-bg px-2 py-1';

/** Search box plus a collapsible filter sheet. Deleted taxonomy is greyed but still filters. */
export function NoteFilters({
  filter,
  onChange,
  taxonomy,
}: {
  filter: NoteFilter;
  onChange: (next: NoteFilter) => void;
  taxonomy: Taxonomy;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<NoteFilter>) => onChange({ ...filter, ...patch });
  const tags = taxonomy.categories.flatMap((c) => c.tags);
  const date = (label: string, from: 'createdFrom' | 'dueFrom', to: 'createdTo' | 'dueTo') => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
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
  const group = (label: string, chips: React.ReactNode) => (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {chips}
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="search"
          value={filter.text}
          onChange={(e) => set({ text: e.target.value })}
          aria-label={t('filters.search')}
          placeholder={t('filters.search')}
          className={`${field} min-w-0 flex-1`}
        />
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
        >
          {t('filters.title')}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
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
            className="self-start rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
          >
            {t('filters.clear')}
          </button>
        </div>
      )}
    </div>
  );
}
