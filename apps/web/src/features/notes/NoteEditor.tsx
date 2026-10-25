import {
  Importance,
  Urgency,
  type Note,
  type NoteEdit,
  type NoteStatus,
  type Suggestion,
  type Taxonomy,
} from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioPlayer } from './AudioPlayer';
import { LinkPreviews } from './LinkPreview';
import { UnreadLinkChips } from './UnreadLinkChips';
import { StatusStepper } from './StatusStepper';
import { TaxonomyPicker, type Picked } from './TaxonomyPicker';

const field = 'rounded-md border border-line bg-bg px-2 py-1';

/** Review a draft or edit a note: change any field, re-ask Claude, save, or delete. */
export function NoteEditor({
  note,
  suggestion,
  taxonomy,
  busy,
  failed,
  onSubmit,
  onCancel,
  onReanalyze,
  onDelete,
}: {
  note: Note;
  suggestion: Suggestion;
  taxonomy: Taxonomy;
  busy: boolean;
  failed: boolean;
  onSubmit: (edit: NoteEdit) => void;
  onCancel: () => void;
  /** Omit to hide the button (import rows are not stored yet). */
  onReanalyze?: (() => Promise<Suggestion>) | undefined;
  onDelete?: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState(note.body);
  const [picked, setPicked] = useState<Picked>({
    categoryIds: suggestion.categoryIds,
    tagIds: suggestion.tagIds,
    newCategories: suggestion.newCategories,
    newTags: suggestion.newTags,
  });
  const [unreadLinks, setUnreadLinks] = useState(suggestion.unreadLinks);
  const [dueDate, setDueDate] = useState(suggestion.dueDate ?? '');
  const [importance, setImportance] = useState<Importance | null>(suggestion.importance);
  const [urgency, setUrgency] = useState<Urgency | null>(suggestion.urgency);

  const [status, setStatus] = useState<NoteStatus>(note.status === 'draft' ? 'todo' : note.status);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeFailed, setAnalyzeFailed] = useState(false);

  /** Fill the fields with a fresh suggestion; nothing is saved until Submit. */
  const reanalyze = async () => {
    setAnalyzing(true);
    setAnalyzeFailed(false);
    try {
      const next = await onReanalyze?.();
      if (!next) return;
      setPicked({
        categoryIds: next.categoryIds,
        tagIds: next.tagIds,
        newCategories: next.newCategories,
        newTags: next.newTags,
      });
      setUnreadLinks(next.unreadLinks);
      setDueDate(next.dueDate ?? '');
      setImportance(next.importance);
      setUrgency(next.urgency);
    } catch {
      setAnalyzeFailed(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = () =>
    onSubmit({
      body,
      ...picked,
      dueDate: dueDate || null,
      importance,
      urgency,
      status,
      unreadLinks,
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-muted">
        {t('notes.body')}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className={`${field} text-base text-fg`}
        />
      </label>
      {unreadLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <UnreadLinkChips links={unreadLinks} />
        </div>
      )}
      <LinkPreviews body={body} />
      {note.hasAudio && <AudioPlayer noteId={note.id} />}
      <TaxonomyPicker taxonomy={taxonomy} value={picked} onChange={setPicked} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('notes.dueDate')}
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`${field} text-fg`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('notes.importance')}
          <select
            value={importance ?? ''}
            onChange={(e) => {
              const v = Importance.safeParse(e.target.value);
              setImportance(v.success ? v.data : null);
            }}
            className={`${field} text-fg`}
          >
            <option value="">{t('notes.none')}</option>
            {Importance.options.map((o) => (
              <option key={o} value={o}>
                {t(`notes.importanceValues.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          {t('notes.urgency')}
          <select
            value={urgency ?? ''}
            onChange={(e) => {
              const v = Urgency.safeParse(e.target.value);
              setUrgency(v.success ? v.data : null);
            }}
            className={`${field} text-fg`}
          >
            <option value="">{t('notes.none')}</option>
            {Urgency.options.map((o) => (
              <option key={o} value={o}>
                {t(`notes.urgencyValues.${o}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {note.status !== 'draft' && <StatusStepper status={status} onChange={setStatus} />}
      {(failed || analyzeFailed) && (
        <p role="alert" className="text-danger">
          {t('notes.error')}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || body.trim() === ''}
          className="rounded-md bg-fg px-4 py-2 text-bg disabled:opacity-50"
        >
          {busy ? t('notes.submitting') : t('notes.submit')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover"
        >
          {t('notes.cancel')}
        </button>
        {onReanalyze && (
          <button
            type="button"
            onClick={reanalyze}
            disabled={analyzing}
            className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover disabled:opacity-50"
          >
            {analyzing ? t('notes.reanalyzing') : t('notes.reanalyze')}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ms-auto rounded-md border border-line px-4 py-2 text-danger hover:bg-surface-hover"
          >
            {t('notes.delete')}
          </button>
        )}
      </div>
    </form>
  );
}
