import type { Note, Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { NoteCard } from './NoteCard';

export function NoteList({
  notes,
  taxonomy,
  today,
  onOpen,
}: {
  notes: Note[];
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
}) {
  const { t } = useTranslation();
  if (notes.length === 0) return <p className="text-muted">{t('notes.empty')}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} taxonomy={taxonomy} today={today} onOpen={onOpen} />
      ))}
    </ul>
  );
}
