import { isOverdue, type Note, type Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';

const formatDate = (iso: string, lang: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(lang);

export function NoteCard({
  note,
  taxonomy,
  today,
}: {
  note: Note;
  taxonomy: Taxonomy;
  today: string;
}) {
  const { t, i18n } = useTranslation();
  const chips = [
    ...taxonomy.categories
      .filter((c) => note.categoryIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, deleted: c.deleted })),
    ...taxonomy.categories
      .flatMap((c) => c.tags)
      .filter((tag) => note.tagIds.includes(tag.id))
      .map((tag) => ({ id: tag.id, name: tag.name, deleted: tag.deleted })),
  ];
  const overdue = isOverdue(note, today);
  return (
    <li className="rounded-lg border border-line p-3">
      <p className="whitespace-pre-wrap break-words">{note.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-surface-hover px-2">{t(`notes.status.${note.status}`)}</span>
        <span className="text-muted">
          {t('notes.created')}: {formatDate(note.createdAt, i18n.language)}
        </span>
        {note.dueDate && (
          <span className={overdue ? 'font-medium text-danger' : 'text-muted'}>
            {t('notes.dueDate')}: {formatDate(note.dueDate, i18n.language)}
            {overdue && ` · ${t('notes.overdue')}`}
          </span>
        )}
        {note.importance && <span>{t(`notes.importanceValues.${note.importance}`)}</span>}
        {note.urgency && <span>{t(`notes.urgencyValues.${note.urgency}`)}</span>}
        {chips.map((c) => (
          <span
            key={c.id}
            className={`rounded-full border border-line px-2 ${
              c.deleted ? 'text-muted line-through opacity-60' : ''
            }`}
          >
            {c.name}
          </span>
        ))}
      </div>
    </li>
  );
}
