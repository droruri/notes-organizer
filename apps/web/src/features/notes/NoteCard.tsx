import { isOverdue, noteHeading, type Note, type Taxonomy } from '@notes/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { NoteCardDetails } from './NoteCardDetails';
import { formatDate } from './formatDate';

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
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const heading = noteHeading(note);
  const overdue = isOverdue(note, today);
  return (
    <li className={`card slip status-${note.status} flex flex-col gap-3 p-4 ps-5`}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => onOpen(note)}
          className="block min-w-0 flex-1 rounded-md text-start"
        >
          <span
            dir="auto"
            className={`block text-[1.0625rem] leading-relaxed break-words whitespace-pre-wrap ${
              note.status === 'done' || heading.fallback ? 'text-muted' : 'font-semibold'
            } ${heading.fallback ? 'truncate' : ''}`}
          >
            {heading.text}
          </span>
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? detailsId : undefined}
          aria-label={t(expanded ? 'notes.collapse' : 'notes.expand')}
          onClick={() => setExpanded((v) => !v)}
          className="-my-2 -me-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted"
        >
          <span
            className={`motion-safe:transition-transform motion-safe:duration-150 ${
              expanded ? 'rotate-180' : ''
            }`}
          >
            <Icon name="chevron" size={20} />
          </span>
        </button>
      </div>
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
        {taxonomy.categories
          .filter((c) => note.categoryIds.includes(c.id))
          .map((c) => (
            <span
              key={c.id}
              data-color={c.color}
              className={`cat-pill ${c.deleted ? 'line-through opacity-60' : ''}`}
            >
              {c.name}
            </span>
          ))}
      </div>
      {expanded ? (
        <NoteCardDetails
          note={note}
          taxonomy={taxonomy}
          showBody={!heading.fallback}
          id={detailsId}
        />
      ) : null}
    </li>
  );
}
