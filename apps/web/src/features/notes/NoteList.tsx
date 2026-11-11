import type { Category, Note, NoteStatus, Taxonomy } from '@notes/shared';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { Section } from '../../ui/Section';
import { NoteCard } from './NoteCard';

const PAGE = 50;

type CategoryOrder = Map<string, { c: Category; i: number }>;

// Per note, the categories in taxonomy order. Cached per note object and per category map, so a
// card keeps the same `categories` array while its note and the taxonomy are unchanged.
const categoriesCache = new WeakMap<Note, { order: CategoryOrder; cats: Category[] }>();
function noteCategories(note: Note, order: CategoryOrder): Category[] {
  const hit = categoriesCache.get(note);
  if (hit && hit.order === order) return hit.cats;
  const cats = [...new Set(note.categoryIds)]
    .flatMap((id) => order.get(id) ?? [])
    .sort((a, b) => a.i - b.i)
    .map(({ c }) => c);
  categoriesCache.set(note, { order, cats });
  return cats;
}

export const NoteList = memo(function NoteList({
  notes,
  filtered,
  taxonomy,
  today,
  onOpen,
  onStatus,
  onToggleItem,
  onSnooze,
  hiddenStatuses,
  statusPendingId,
  onAdd,
  workspaceNames,
  selectedId,
  foldDone = false,
}: {
  notes: Note[];
  /** Notes exist, but the filter hides all of them. */
  filtered: boolean;
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
  onStatus: (note: Note, status: NoteStatus | null) => void;
  onToggleItem?: ((note: Note, index: number) => void) | undefined;
  onSnooze?: ((note: Note, day: string | null) => void) | undefined;
  hiddenStatuses: readonly NoteStatus[];
  /** Id of the note whose status save is pending. */
  statusPendingId?: string | undefined;
  /** Shown as the empty state's action when there are no notes at all. */
  onAdd?: () => void;
  /** Workspace id → name; set only when notes from every workspace are listed. */
  workspaceNames?: Map<string, string> | undefined;
  /** The note open in the detail pane. */
  selectedId?: string | undefined;
  /** Put done notes behind one closed "Done (N)" row after the open ones. */
  foldDone?: boolean;
}) {
  const { t } = useTranslation();
  const split = useMemo(() => {
    if (!foldDone) return null;
    const open = notes.filter((n) => n.status !== 'done');
    if (open.length === 0 || open.length === notes.length) return null;
    return { open, done: notes.filter((n) => n.status === 'done') };
  }, [notes, foldDone]);
  const [shown, setShown] = useState(PAGE);
  // Back to the first page when the list changes, without remounting the cards.
  const [pagedFor, setPagedFor] = useState(notes);
  if (notes !== pagedFor) {
    setPagedFor(notes);
    setShown(PAGE);
  }
  // One id → category map per taxonomy, so each card looks its categories up instead of filtering.
  const categoryOrder = useMemo<CategoryOrder>(
    () => new Map(taxonomy.categories.map((c, i) => [c.id, { c, i }])),
    [taxonomy.categories],
  );
  const sentinel = useRef<HTMLLIElement>(null);
  const more = shown < notes.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!more || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
      },
      { rootMargin: '800px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, shown]);
  if (split) {
    return (
      <div className="flex flex-col gap-3">
        <NoteList
          notes={split.open}
          filtered={filtered}
          taxonomy={taxonomy}
          today={today}
          onOpen={onOpen}
          onStatus={onStatus}
          onToggleItem={onToggleItem}
          onSnooze={onSnooze}
          hiddenStatuses={hiddenStatuses}
          statusPendingId={statusPendingId}
          workspaceNames={workspaceNames}
          selectedId={selectedId}
        />
        <Section title={t('notes.status.done')} count={split.done.length} collapsible>
          <NoteList
            notes={split.done}
            filtered={filtered}
            taxonomy={taxonomy}
            today={today}
            onOpen={onOpen}
            onStatus={onStatus}
            onToggleItem={onToggleItem}
            onSnooze={onSnooze}
            hiddenStatuses={hiddenStatuses}
            statusPendingId={statusPendingId}
            workspaceNames={workspaceNames}
            selectedId={selectedId}
          />
        </Section>
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="enter-fade flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong/60 px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon name={filtered ? 'search' : 'note'} size={22} />
        </span>
        <p className="font-medium">{t(filtered ? 'notes.noMatches' : 'notes.empty')}</p>
        {!filtered && <p className="max-w-xs text-sm text-muted">{t('notes.emptyHint')}</p>}
        {!filtered && onAdd && (
          <button type="button" onClick={onAdd} className="btn btn-primary mt-2 max-sm:hidden">
            <Icon name="plus" size={18} />
            {t('notes.add')}
          </button>
        )}
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {notes.slice(0, shown).map((n) => (
        <NoteCard
          key={n.id}
          note={n}
          taxonomy={taxonomy}
          categories={noteCategories(n, categoryOrder)}
          today={today}
          onOpen={onOpen}
          onStatus={onStatus}
          onToggleItem={onToggleItem}
          onSnooze={onSnooze}
          hiddenStatuses={hiddenStatuses}
          statusPending={statusPendingId === n.id}
          workspaceName={workspaceNames?.get(n.workspaceId)}
          selected={selectedId === n.id}
        />
      ))}
      {more && <li ref={sentinel} aria-hidden className="h-px" />}
    </ul>
  );
});
