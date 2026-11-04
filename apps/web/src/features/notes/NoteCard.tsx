import {
  isOverdue,
  nextStatus,
  noteHeading,
  statusClass,
  type Note,
  type NoteStatus,
  type Taxonomy,
} from '@notes/shared';
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
  onStatus,
  hiddenStatuses,
  statusPending = false,
  workspaceName,
  selected = false,
}: {
  note: Note;
  taxonomy: Taxonomy;
  today: string;
  onOpen: (note: Note) => void;
  onStatus: (note: Note, status: NoteStatus | null) => void;
  /** Statuses the status button skips over. */
  hiddenStatuses: readonly NoteStatus[];
  /** This note's status save is in flight. */
  statusPending?: boolean;
  /** Shown as a pill when listing across workspaces. */
  workspaceName?: string | undefined;
  /** Open in the detail pane. */
  selected?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const heading = noteHeading(note);
  const overdue = isOverdue(note, today);
  const tracked = note.status === null || note.status === 'draft' ? null : note.status;
  return (
    <li
      aria-current={selected ? 'true' : undefined}
      className={`card slip ${statusClass(note.status)} flex flex-col gap-3 p-4 ps-5 ${selected ? 'ring-2 ring-accent' : ''}`}
    >
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
        {tracked !== null && (
          <button
            type="button"
            aria-label={t('notes.status.advance', {
              current: t(`notes.status.${tracked}`),
              next: t(`notes.status.${nextStatus(tracked, hiddenStatuses)}`),
            })}
            disabled={statusPending}
            onClick={() => onStatus(note, nextStatus(tracked, hiddenStatuses))}
            className={`btn btn-sm pill-dot ${statusClass(tracked)}`}
          >
            {t(`notes.status.${tracked}`)}
          </button>
        )}
        {tracked !== null && tracked !== 'done' && !hiddenStatuses.includes('done') && (
          <button
            type="button"
            aria-label={t('notes.status.markDone')}
            disabled={statusPending}
            onClick={() => onStatus(note, 'done')}
            className="btn btn-sm text-ok"
          >
            <Icon name="check" size={16} />
            {t('notes.status.done')}
          </button>
        )}
        {note.status === 'draft' && (
          <span className={`pill pill-dot ${statusClass(note.status)}`}>
            {t(`notes.status.${note.status}`)}
          </span>
        )}
        {workspaceName && (
          <span className="pill bg-transparent text-muted">
            <Icon name="layers" size={13} />
            <span className="sr-only">{t('filters.workspace')}: </span>
            {workspaceName}
          </span>
        )}
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
