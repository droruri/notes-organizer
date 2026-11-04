import type { NoteFilter, Note, Taxonomy } from '@notes/shared';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { useIsWide } from '../../ui/useIsWide';
import type { RankedCategory } from './categoryRank';
import { MIN_QUERY, buildTitleIndex, suggest } from './suggest';

type Row = { key: string; label: string; kind: string; color?: string; pick: () => void };

/** Search input with instant on-device suggestions: categories, tags and note titles. */
export function SearchBox({
  filter,
  onChange,
  taxonomy,
  notes = [],
  ranked = [],
  onOpenNote,
}: {
  filter: NoteFilter;
  onChange: (next: NoteFilter) => void;
  taxonomy: Taxonomy;
  notes?: Note[];
  ranked?: RankedCategory[];
  onOpenNote?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const wide = useIsWide();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const titles = useMemo(() => buildTitleIndex(notes), [notes]);

  const query = filter.text;
  const enabled = query.trim().length >= MIN_QUERY;
  const result = useMemo(
    () => (enabled ? suggest(query, { titles, taxonomy, ranked }) : null),
    [enabled, query, titles, taxonomy, ranked],
  );

  const rows: Row[] = [];
  if (result) {
    const clear = { text: '' };
    const catRows: Row[] = result.categories.map(({ category: c }) => ({
      key: `c-${c.id}`,
      label: c.name,
      kind: t('filters.suggestCategory'),
      color: c.color,
      pick: () =>
        onChange({
          ...filter,
          ...clear,
          categoryIds: filter.categoryIds.includes(c.id)
            ? filter.categoryIds
            : [...filter.categoryIds, c.id],
        }),
    }));
    const tagRows: Row[] = result.tags.map(({ tag, categoryName }) => ({
      key: `t-${tag.id}`,
      label: `${tag.name} · ${categoryName}`,
      kind: t('filters.suggestTag'),
      pick: () =>
        onChange({
          ...filter,
          ...clear,
          tagIds: filter.tagIds.includes(tag.id) ? filter.tagIds : [...filter.tagIds, tag.id],
        }),
    }));
    const noteRows: Row[] = result.notes.map((n) => ({
      key: `n-${n.id}`,
      label: n.title,
      kind: t('filters.suggestNote'),
      pick: () => {
        inputRef.current?.blur();
        onOpenNote?.(n.id);
      },
    }));
    // Phones: 5 rows (2 taxonomy + 3 notes) so the panel fits above the keyboard.
    rows.push(
      ...(wide
        ? [...catRows, ...tagRows, ...noteRows]
        : [...[...catRows, ...tagRows].slice(0, 2), ...noteRows.slice(0, 3)]),
    );
  }

  const showPanel = open && enabled;
  const activeRow = active >= 0 ? rows[active] : undefined;

  useEffect(() => {
    if (!showPanel) return;
    const vv = window.visualViewport;
    const input = inputRef.current;
    if (!vv || !input) return;
    const update = () => {
      const bottom = input.getBoundingClientRect().bottom;
      // visible area ends at offsetTop + height; the page may be scrolled under the keyboard
      setMaxHeight(Math.max(44, vv.offsetTop + vv.height - bottom - 2));
    };
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [showPanel]);

  const pick = (row: Row) => {
    row.pick();
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (showPanel) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!enabled || rows.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + rows.length) % rows.length);
    } else if (e.key === 'Enter' && showPanel && activeRow) {
      e.preventDefault();
      pick(activeRow);
    }
  };

  return (
    <div className="relative min-w-48 flex-1">
      <Icon
        name="search"
        size={18}
        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && activeRow ? `${listId}-${active}` : undefined}
        data-notes-search=""
        value={filter.text}
        onChange={(e) => {
          onChange({ ...filter, text: e.target.value });
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        aria-label={t('filters.search')}
        placeholder={t('filters.search')}
        className="field min-h-11 ps-10"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={t('filters.suggestions')}
        hidden={!showPanel}
        style={maxHeight === undefined ? undefined : { maxHeight }}
        className="absolute inset-x-0 top-full z-20 mt-0.5 overflow-y-auto rounded-lg bg-bg shadow-lg ring-1 ring-line-strong"
      >
        {rows.map((row, i) => (
          <li
            key={row.key}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            // mousedown would blur the input and close the panel before the click lands
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(row)}
            className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm ${i === active ? 'bg-accent/10' : ''}`}
          >
            {row.color ? (
              <span className="cat-pill min-h-0 max-w-[20ch] truncate" data-color={row.color}>
                {row.label}
              </span>
            ) : (
              <span className="max-w-[28ch] truncate">{row.label}</span>
            )}
            <span className="ms-auto text-xs text-muted">{row.kind}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li role="presentation" className="flex min-h-11 items-center px-3 text-sm text-muted">
            {t('filters.suggestEmpty')}
          </li>
        )}
      </ul>
    </div>
  );
}
