import type { Note, NoteStatus, Taxonomy } from '@notes/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { NoteCard } from './NoteCard';

const PAGE = 50;

export function NoteList({
  notes,
  filtered,
  taxonomy,
  today,
  onOpen,
  onStatus,
  onToggleItem,
  hiddenStatuses,
  statusPendingId,
  onAdd,
  workspaceNames,
  selectedId,
}: {
  notes: Note[];
  /** Notes exist, but the filter hides all of them. */
  filtered: boolean;
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
  onStatus: (note: Note, status: NoteStatus | null) => void;
  onToggleItem?: ((note: Note, index: number) => void) | undefined;
  hiddenStatuses: readonly NoteStatus[];
  /** Id of the note whose status save is pending. */
  statusPendingId?: string | undefined;
  /** Shown as the empty state's action when there are no notes at all. */
  onAdd?: () => void;
  /** Workspace id → name; set only when notes from every workspace are listed. */
  workspaceNames?: Map<string, string> | undefined;
  /** The note open in the detail pane. */
  selectedId?: string | undefined;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(PAGE);
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
          today={today}
          onOpen={onOpen}
          onStatus={onStatus}
          onToggleItem={onToggleItem}
          hiddenStatuses={hiddenStatuses}
          statusPending={statusPendingId === n.id}
          workspaceName={workspaceNames?.get(n.workspaceId)}
          selected={selectedId === n.id}
        />
      ))}
      {more && <li ref={sentinel} aria-hidden className="h-px" />}
    </ul>
  );
}
