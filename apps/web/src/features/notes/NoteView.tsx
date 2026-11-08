import { noteHeading, type Note, type Taxonomy } from '@notes/shared';
import { useTranslation } from 'react-i18next';
import { NavBar } from '../../ui/NavBar';
import { ChecklistView } from './ChecklistView';
import { NoteCardDetails } from './NoteCardDetails';
import { formatDate } from './formatDate';

/** Read-only page of one note; the Edit button opens the full editor. */
export function NoteView({
  note,
  taxonomy,
  onBack,
  onEdit,
  onToggleItem,
  togglePending = false,
  onToggleChecklist,
  checklistDisabled = false,
  checklistError = false,
  workspaceName,
}: {
  note: Note;
  taxonomy: Taxonomy;
  onBack: () => void;
  onEdit: () => void;
  onToggleItem?: (note: Note, index: number) => void;
  togglePending?: boolean;
  onToggleChecklist?: (note: Note, itemId: string) => void;
  checklistDisabled?: boolean;
  checklistError?: boolean;
  workspaceName?: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const heading = noteHeading(note);
  const rows: [string, string][] = [];
  if (note.dueDate) rows.push([t('notes.dueDate'), formatDate(note.dueDate, i18n.language)]);
  if (workspaceName) rows.push([t('notes.workspace'), workspaceName]);
  return (
    <article className="flex flex-col gap-4 lg:max-w-2xl">
      <NavBar
        title={t('notes.viewTitle')}
        onBack={onBack}
        action={
          <button type="button" onClick={onEdit} className="btn btn-primary min-h-11 lg:min-h-0">
            {t('notes.edit')}
          </button>
        }
      />
      <h2
        dir="auto"
        className={`text-2xl leading-snug font-bold break-words lg:text-4xl ${heading.fallback ? 'truncate' : ''}`}
      >
        {heading.text}
      </h2>
      {note.status && note.status !== 'draft' && (
        <span className="pill self-start">{t(`notes.status.${note.status}`)}</span>
      )}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <ChecklistView
        items={note.checklist}
        disabled={checklistDisabled || !onToggleChecklist}
        onToggle={(id) => onToggleChecklist?.(note, id)}
      />
      {checklistDisabled && <p className="text-muted text-sm">{t('offline.checklistDisabled')}</p>}
      {checklistError && (
        <p role="alert" className="notice notice-danger">
          {t('notes.error')}
        </p>
      )}
      <NoteCardDetails
        note={note}
        taxonomy={taxonomy}
        showBody
        id={`note-view-${note.id}`}
        onToggleItem={onToggleItem}
        togglePending={togglePending}
      />
    </article>
  );
}
