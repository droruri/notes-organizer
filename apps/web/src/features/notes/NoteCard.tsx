import { isOverdue, type Note, type Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { AudioPlayer } from './AudioPlayer';
import { LinkPreviews } from './LinkPreview';
import { UnreadLinkChips } from './UnreadLinkChips';

const formatDate = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso.length === 10 ? `${iso}T00:00:00` : iso),
  );

export function NoteCard({
  note,
  taxonomy,
  today,
  onOpen,
}: {
  note: Note;
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
}) {
  const { t, i18n } = useTranslation();
  const chips = [
    ...taxonomy.categories
      .filter((c) => note.categoryIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, deleted: c.deleted, category: true })),
    ...taxonomy.categories
      .flatMap((c) => c.tags)
      .filter((tag) => note.tagIds.includes(tag.id))
      .map((tag) => ({ id: tag.id, name: tag.name, deleted: tag.deleted, category: false })),
  ];
  const overdue = isOverdue(note, today);
  const urgent = note.urgency === 'urgent' || note.urgency === 'critical';
  return (
    <li className={`card slip status-${note.status} flex flex-col gap-3 p-4 ps-5`}>
      <button
        type="button"
        onClick={() => onOpen(note)}
        className="block w-full rounded-md text-start"
      >
        <span
          dir="auto"
          className={`block text-[1.0625rem] leading-relaxed break-words whitespace-pre-wrap ${
            note.status === 'done' ? 'text-muted' : ''
          }`}
        >
          {note.body}
        </span>
      </button>
      <LinkPreviews body={note.body} />
      {note.hasAudio && <AudioPlayer noteId={note.id} />}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className={`pill pill-dot status-${note.status}`}>
          {t(`notes.status.${note.status}`)}
        </span>
        {note.dueDate && (
          <span
            className={`pill ${overdue ? 'bg-danger-soft text-danger' : 'bg-transparent text-muted'}`}
          >
            <Icon name="calendar" size={13} />
            <span className="sr-only">{t('notes.dueDate')}: </span>
            {formatDate(note.dueDate, i18n.language)}
            {overdue && ` · ${t('notes.overdue')}`}
          </span>
        )}
        {note.urgency && (
          <span className={`pill ${urgent ? 'bg-marker text-marker-fg' : ''}`}>
            {t(`notes.urgencyValues.${note.urgency}`)}
          </span>
        )}
        {note.importance && (
          <span className="pill">{t(`notes.importanceValues.${note.importance}`)}</span>
        )}
        <UnreadLinkChips links={note.unreadLinks} />
        {chips.map((c) => (
          <span
            key={c.id}
            className={`tag ${c.category ? 'font-medium text-fg' : ''} ${
              c.deleted ? 'line-through opacity-60' : ''
            }`}
          >
            {c.category ? c.name : `#${c.name}`}
          </span>
        ))}
        <span className="ms-auto text-xs text-muted tabular-nums">
          <span className="sr-only">{t('notes.created')}: </span>
          {formatDate(note.createdAt, i18n.language)}
        </span>
      </div>
    </li>
  );
}
