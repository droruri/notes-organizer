import type { Note, Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { NoteCard } from './NoteCard';

export function NoteList({
  notes,
  filtered,
  taxonomy,
  today,
  onOpen,
  onAdd,
}: {
  notes: Note[];
  /** Notes exist, but the filter hides all of them. */
  filtered: boolean;
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
  /** Shown as the empty state's action when there are no notes at all. */
  onAdd?: () => void;
}) {
  const { t } = useTranslation();
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
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} taxonomy={taxonomy} today={today} onOpen={onOpen} />
      ))}
    </ul>
  );
}
