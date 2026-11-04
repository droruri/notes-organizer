import type { NoteFilter } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { useIsWide } from '../../ui/useIsWide';
import type { RankedCategory } from './categoryRank';

const MAX = 8;
/** Below `lg` three chips plus the "+N" chip keep the wrapped strip within two lines at 375px. */
const NARROW_MAX = 3;

/** Wrapping row of the top-ranked categories; tapping one toggles it in the filter. */
export function CategoryStrip({
  ranked,
  filter,
  onChange,
  onOpenAll,
}: {
  ranked: RankedCategory[];
  filter: NoteFilter;
  onChange: (next: NoteFilter) => void;
  /** Opens the filter sheet. */
  onOpenAll: () => void;
}) {
  const { t } = useTranslation();
  const wide = useIsWide();
  if (ranked.length === 0) return null;
  const shown = ranked.slice(0, wide ? MAX : NARROW_MAX);
  const rest = ranked.length - shown.length;
  const toggle = (id: string) =>
    onChange({
      ...filter,
      categoryIds: filter.categoryIds.includes(id)
        ? filter.categoryIds.filter((x) => x !== id)
        : [...filter.categoryIds, id],
    });
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={t('notes.picker.categories')}>
      {shown.map(({ category: c, count }) => {
        const selected = filter.categoryIds.includes(c.id);
        return (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${c.name} (${count})`}
              onClick={() => toggle(c.id)}
              className="inline-flex min-h-11 min-w-11 items-center"
            >
              <span
                className={`cat-pill gap-1.5 ${selected ? 'font-semibold ring-2 ring-accent' : ''}`}
                data-color={c.color}
              >
                <span className="max-w-[12ch] truncate">{c.name}</span>
                <span className="tabular-nums opacity-70">{count}</span>
              </span>
            </button>
          </li>
        );
      })}
      <li>
        <button type="button" onClick={onOpenAll} className="btn min-h-11 min-w-11">
          {rest > 0 && !wide ? `+${rest}` : t('categoryStrip.all')}
        </button>
      </li>
    </ul>
  );
}
