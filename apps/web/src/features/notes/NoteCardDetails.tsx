import type { Note, Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { Attachments } from '../attachments/Attachments';
import { AudioPlayer } from './AudioPlayer';
import { LinkPreviews } from './LinkPreview';
import { UnreadLinkChips } from './UnreadLinkChips';
import { parseBody } from './checklist';
import { formatDate, updatedDate } from './formatDate';

export function NoteCardDetails({
  note,
  taxonomy,
  showBody,
  id,
  onToggleItem,
  togglePending = false,
}: {
  note: Note;
  taxonomy: Taxonomy;
  showBody: boolean;
  id: string;
  onToggleItem?: ((note: Note, index: number) => void) | undefined;
  togglePending?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const urgent = note.urgency === 'urgent' || note.urgency === 'critical';
  const tags = taxonomy.categories
    .flatMap((c) => c.tags)
    .filter((tag) => note.tagIds.includes(tag.id));
  const updated = updatedDate(note.createdAt, note.updatedAt, i18n.language);
  return (
    <div id={id} className="flex flex-col gap-3">
      {showBody && (
        <div className="flex flex-col">
          {parseBody(note.body).map((line, i) =>
            line.kind === 'item' ? (
              <label
                key={i}
                dir="auto"
                className="flex min-h-11 items-center gap-3 leading-relaxed break-words"
              >
                <input
                  type="checkbox"
                  checked={line.checked}
                  disabled={togglePending || !onToggleItem}
                  onChange={() => onToggleItem?.(note, line.index)}
                  className="size-5 shrink-0"
                />
                <span className={line.checked ? 'text-muted line-through' : ''}>{line.text}</span>
              </label>
            ) : (
              <span
                key={i}
                dir="auto"
                className="block min-h-[1lh] leading-relaxed break-words whitespace-pre-wrap text-muted"
              >
                {line.text}
              </span>
            ),
          )}
        </div>
      )}
      <LinkPreviews body={note.body} />
      {note.hasAudio && <AudioPlayer noteId={note.id} />}
      {note.attachments.length > 0 && (
        <Attachments noteId={note.id} attachments={note.attachments} editable={false} />
      )}
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
        {tags.map((tag) => (
          <span key={tag.id} className={`tag-box ${tag.deleted ? 'line-through opacity-60' : ''}`}>
            {tag.name}
          </span>
        ))}
        <span className="ms-auto text-xs text-muted tabular-nums">
          <span className="sr-only">{t('notes.created')}: </span>
          {formatDate(note.createdAt, i18n.language)}
        </span>
        {updated && (
          <span className="text-xs text-muted tabular-nums">
            {t('notes.updated')} {updated}
          </span>
        )}
      </div>
    </div>
  );
}
