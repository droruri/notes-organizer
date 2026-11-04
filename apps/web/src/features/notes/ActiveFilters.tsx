import { EMPTY_FILTER, type NoteFilter, type Taxonomy } from '@notes/shared';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { describeFilter } from './describeFilter';

/** Chips kept visible below `lg` before the "+N" disclosure; one chip keeps the row on one line at 390px. */
const NARROW_VISIBLE = 1;

const query = '(min-width: 1024px)';
const subscribe = (cb: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(query);
  if (typeof mq.addEventListener !== 'function') return () => {};
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isWide = () => typeof window.matchMedia !== 'function' || window.matchMedia(query).matches;

/** One removable chip per active filter value, plus "clear all". Hidden when nothing is active. */
export function ActiveFilters({
  filter,
  taxonomy,
  onChange,
  allWorkspaces = false,
  onAllWorkspaces,
}: {
  filter: NoteFilter;
  taxonomy: Taxonomy;
  onChange: (next: NoteFilter) => void;
  allWorkspaces?: boolean;
  onAllWorkspaces?: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const wide = useSyncExternalStore(subscribe, isWide, () => true);
  const [expanded, setExpanded] = useState(false);

  const chips = describeFilter(filter, taxonomy, t).map((c) => ({
    key: c.key,
    label: c.label,
    color: c.color,
    deleted: c.deleted ?? false,
    remove: () => onChange(c.remove(filter)),
  }));
  if (allWorkspaces && onAllWorkspaces)
    chips.push({
      key: 'allWorkspaces',
      label: t('filters.allWorkspaces'),
      color: undefined,
      deleted: false,
      remove: () => onAllWorkspaces(false),
    });
  if (chips.length === 0) return null;

  const capped = !wide && !expanded && chips.length > NARROW_VISIBLE + 1;
  const shown = capped ? chips.slice(0, NARROW_VISIBLE) : chips;
  const hidden = chips.length - shown.length;

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={t('filters.active')}>
      {shown.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            aria-label={t('filters.remove', { name: c.label })}
            onClick={c.remove}
            className="inline-flex min-h-11 min-w-11 items-center"
          >
            <span
              className={`cat-pill gap-1.5 ${c.deleted ? 'text-muted line-through opacity-60' : ''}`}
              {...(c.color && { 'data-color': c.color })}
            >
              <span className="max-w-[20ch] truncate">{c.label}</span>
              <Icon name="close" size={12} aria-hidden="true" />
            </span>
          </button>
        </li>
      ))}
      {!wide && chips.length > NARROW_VISIBLE + 1 && (
        <li>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="btn btn-ghost min-h-11 min-w-11"
          >
            {expanded ? t('filters.showLess') : `+${hidden}`}
          </button>
        </li>
      )}
      <li>
        <button
          type="button"
          onClick={() => {
            onChange({ ...EMPTY_FILTER, text: filter.text });
            onAllWorkspaces?.(false);
          }}
          className="btn btn-ghost min-h-11 text-muted"
        >
          {t('filters.clearAll')}
        </button>
      </li>
    </ul>
  );
}
