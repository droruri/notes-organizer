import type { Note, Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { AudioPlayer } from './AudioPlayer';
import { LinkPreviews } from './LinkPreview';
import { UnreadLinkChips } from './UnreadLinkChips';
import { formatDate } from './formatDate';

type Chip = { id: string; name: string; deleted: boolean; category: boolean };

export function NoteCardDetails({
  note,
  taxonomy,
  showBody,
  id,
}: {
  note: Note;
  taxonomy: Taxonomy;
  showBody: boolean;
  id: string;
}) {
  const { t, i18n } = useTranslation();
  const urgent = note.urgency === 'urgent' || note.urgency === 'critical';
  const chips: Chip[] = [
    ...taxonomy.categories
      .filter((c) => note.categoryIds.includes(c.id))
      .map((c) => ({ id: c.id, name: c.name, deleted: c.deleted, category: true })),
    ...taxonomy.categories
      .flatMap((c) => c.tags)
      .filter((tag) => note.tagIds.includes(tag.id))
      .map((tag) => ({ id: tag.id, name: tag.name, deleted: tag.deleted, category: false })),
  ];
  return (
    <div id={id} className="flex flex-col gap-3">
      {showBody && (
        <span
          dir="auto"
          className="block leading-relaxed break-words whitespace-pre-wrap text-muted"
        >
          {note.body}
        </span>
      )}
      <LinkPreviews body={note.body} />
      {note.hasAudio && <AudioPlayer noteId={note.id} />}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
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
    </div>
  );
}
