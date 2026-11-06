import {
  EMPTY_FILTER,
  Importance,
  NoteStatus,
  Urgency,
  type Note,
  type NoteFilter,
  type SavedFilter,
  type Taxonomy,
} from '@notes/shared';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useOnline } from '../offline/useOnline';
import { ActiveFilters } from './ActiveFilters';
import { Chip } from './Chip';
import type { RankedCategory } from './categoryRank';
import { SearchBox } from './SearchBox';

const toggle = <T,>(list: T[], x: T): T[] =>
  list.includes(x) ? list.filter((y) => y !== x) : [...list, x];

const field = 'field min-h-9 w-auto py-1 text-sm';

/** How many filter fields (besides the search text) are set. */
const activeCount = (filter: NoteFilter) =>
  Object.entries(filter).filter(
    ([key, value]) => key !== 'text' && (Array.isArray(value) ? value.length > 0 : Boolean(value)),
  ).length;

/** Whether a filter equals the saved default, ignoring the search text. */
const comparable = (f: NoteFilter) =>
  JSON.stringify(
    Object.entries(f)
      .filter(([key]) => key !== 'text')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]),
  );
const matchesDefault = (filter: NoteFilter, saved: SavedFilter | null) =>
  comparable({ ...EMPTY_FILTER, ...filter }) === comparable({ ...EMPTY_FILTER, ...saved });

/** Search box plus a Filters button that opens one sheet with the filters and the sort. Deleted taxonomy is greyed but still filters. */
export function NoteFilters({
  filter,
  onChange,
  taxonomy,
  sort,
  allWorkspaces = false,
  onAllWorkspaces,
  showAllWorkspaces = false,
  onSaveDefault,
  savedDefault = null,
  sheetOpen,
  onSheetOpenChange,
  notes = [],
  ranked = [],
  onOpenNote,
  onSmartSearch,
  smartPending = false,
  understood = false,
}: {
  filter: NoteFilter;
  onChange: (next: NoteFilter) => void;
  taxonomy: Taxonomy;
  /** The sort control, shown inside the filters sheet. */
  sort?: ReactNode;
  allWorkspaces?: boolean;
  onAllWorkspaces?: (next: boolean) => void;
  /** Only offered when the user has more than one workspace. */
  showAllWorkspaces?: boolean;
  /** Saves the current filter (minus the text) as the workspace's default. */
  onSaveDefault?: () => void;
  savedDefault?: SavedFilter | null;
  /** Controlled sheet state, so other UI (the category strip) can open the sheet. */
  sheetOpen?: boolean;
  onSheetOpenChange?: (open: boolean) => void;
  /** Feed the search suggestions. */
  notes?: Note[];
  ranked?: RankedCategory[];
  onOpenNote?: (id: string) => void;
  onSmartSearch?: (text: string) => void;
  smartPending?: boolean;
  /** The filter was just produced from a sentence; label the chips until it is edited. */
  understood?: boolean;
}) {
  const { t } = useTranslation();
  const [localOpen, setLocalOpen] = useState(false);
  const open = sheetOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    setLocalOpen(next);
    onSheetOpenChange?.(next);
  };
  const online = useOnline();
  const isDefault = savedDefault !== null && matchesDefault(filter, savedDefault);
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
        <SearchBox
          filter={filter}
          onChange={onChange}
          taxonomy={taxonomy}
          notes={notes}
          ranked={ranked}
          {...(onOpenNote && { onOpenNote })}
          {...(onSmartSearch && { onSmartSearch })}
          pending={smartPending}
        />
        {showAllWorkspaces && onAllWorkspaces && (
          <Chip
            label={t('filters.allWorkspaces')}
            selected={allWorkspaces}
            onClick={() => onAllWorkspaces(!allWorkspaces)}
          />
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          aria-haspopup="dialog"
          className={`btn min-h-11 ${open || active > 0 ? 'text-accent' : ''}`}
        >
          <Icon name="filter" size={16} />
          {t('filters.title')}
          {active > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1 text-xs leading-5 text-[var(--accent-fg)] tabular-nums">
              {active}
            </span>
          )}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2">
        {understood && <span className="text-sm text-muted">{t('filters.understood')}</span>}
        <ActiveFilters
          filter={filter}
          taxonomy={taxonomy}
          onChange={onChange}
          allWorkspaces={allWorkspaces}
          {...(onAllWorkspaces && { onAllWorkspaces })}
        />
      </div>
      {open && (
        <Sheet title={t('filters.sheetTitle')} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4 p-4">
            {sort}
            {group(
              t('notes.picker.categories'),
              taxonomy.categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  color={c.color}
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
                  tag
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
            {group(
              t('snooze.filter'),
              <Chip
                label={t('snooze.filter')}
                selected={filter.snoozedOnly}
                onClick={() => set({ snoozedOnly: !filter.snoozedOnly })}
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
            {onSaveDefault && !allWorkspaces && (
              <button
                type="button"
                onClick={onSaveDefault}
                disabled={isDefault || !online}
                className="btn btn-ghost btn-sm self-start text-muted"
              >
                {isDefault ? t('filters.isDefault') : t('filters.saveDefault')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-primary min-h-11"
            >
              {t('filters.done')}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
