import {
  Importance,
  MAX_TITLE_LENGTH,
  Urgency,
  raiseImportance,
  type Note,
  type NoteEdit,
  type NoteStatus,
  type Suggestion,
  type Taxonomy,
} from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../ui/Icon';
import { useSlow } from '../../ui/useSlow';
import { Attachments } from '../attachments/Attachments';
import { AudioPlayer } from './AudioPlayer';
import { LinkPreviews } from './LinkPreview';
import { UnreadLinkChips } from './UnreadLinkChips';
import { StatusStepper } from './StatusStepper';
import { pickedFrom } from './picked';
import { TaxonomyPicker, type Picked } from './TaxonomyPicker';

const field = 'field';

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
  attachable,
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
  /** Show the attachments with an "Add file" button; omit for notes that are not stored yet. */
  attachable?: boolean | undefined;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(note.title ?? '');
  const [body, setBody] = useState(note.body);
  const slow = useSlow(busy);
  // Any field Claude filled in counts; comparing JSON would depend on key order.
  const hasSuggestion = Object.values(suggestion).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== '',
  );
  const [picked, setPicked] = useState<Picked>(pickedFrom(suggestion));
  const [unreadLinks, setUnreadLinks] = useState(suggestion.unreadLinks);
  const [dueDate, setDueDate] = useState(suggestion.dueDate ?? '');
  const [importance, setImportance] = useState<Importance | null>(suggestion.importance);
  // Name of the category that raised importance; cleared when the field is changed by hand.
  const [importanceHint, setImportanceHint] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<Urgency | null>(suggestion.urgency);

  const [status, setStatus] = useState<NoteStatus>(note.status === 'draft' ? 'todo' : note.status);
  const [analyzing, setAnalyzing] = useState(false);
  const slowReanalyze = useSlow(analyzing);
  const [analyzeFailed, setAnalyzeFailed] = useState(false);

  /** Only categories added by this change (directly or via a tag) can raise importance. */
  const changePicked = (next: Picked) => {
    const tagCategory = (id: string) =>
      taxonomy.categories.find((c) => c.tags.some((tg) => tg.id === id))?.id;
    const added = [
      ...next.categoryIds.filter((id) => !picked.categoryIds.includes(id)),
      ...next.tagIds
        .filter((id) => !picked.tagIds.includes(id))
        .map(tagCategory)
        .filter((id): id is string => id !== undefined),
    ];
    setPicked(next);
    const raised = raiseImportance(importance, added, taxonomy);
    if (raised === importance) return;
    setImportance(raised);
    setImportanceHint(
      taxonomy.categories.find((c) => added.includes(c.id) && c.importance === raised)?.name ??
        null,
    );
  };

  /** Fill the fields with a fresh suggestion; nothing is saved until Submit. */
  const reanalyze = async () => {
    setAnalyzing(true);
    setAnalyzeFailed(false);
    try {
      const next = await onReanalyze?.();
      if (!next) return;
      // Functional update: a title typed while the AI ran must not be overwritten.
      setTitle((cur) => (cur.trim() ? cur : (next.title ?? '')));
      setPicked(pickedFrom(next));
      setUnreadLinks(next.unreadLinks);
      setDueDate(next.dueDate ?? '');
      setImportance(next.importance);
      setImportanceHint(null);
      setUrgency(next.urgency);
    } catch {
      setAnalyzeFailed(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = () =>
    onSubmit({
      title: title.trim() || null,
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
      className="enter-rise flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">
          {note.status === 'draft' ? t('notes.reviewTitle') : t('notes.editTitle')}
        </h2>
        {note.status === 'draft' && hasSuggestion && (
          <span className="marker inline-flex items-center gap-1">
            <Icon name="spark" size={13} />
            {t('notes.suggested')}
          </span>
        )}
      </div>
      <label className="label">
        {t('notes.noteTitle')}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          dir="auto"
          className={`${field} text-fg`}
        />
      </label>
      <label className="label">
        {t('notes.body')}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          dir="auto"
          className={`${field} text-[1.0625rem] text-fg`}
        />
      </label>
      {unreadLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <UnreadLinkChips links={unreadLinks} />
        </div>
      )}
      <LinkPreviews body={body} />
      {note.hasAudio && <AudioPlayer noteId={note.id} />}
      {attachable && <Attachments noteId={note.id} attachments={note.attachments} editable />}
      <TaxonomyPicker taxonomy={taxonomy} value={picked} onChange={changePicked} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="label">
          {t('notes.dueDate')}
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`${field} text-fg`}
          />
        </label>
        <label className="label">
          {t('notes.importance')}
          <select
            value={importance ?? ''}
            onChange={(e) => {
              const v = Importance.safeParse(e.target.value);
              setImportance(v.success ? v.data : null);
              setImportanceHint(null);
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
          {importanceHint && (
            <span className="text-sm font-normal text-muted">
              {t('notes.importanceFromCategory', { name: importanceHint })}
            </span>
          )}
        </label>
        <label className="label">
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
        <p role="alert" className="notice notice-danger">
          {t('notes.error')}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-bg/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <button type="submit" disabled={busy || body.trim() === ''} className="btn btn-primary">
          {busy && <span aria-hidden="true" className="spinner" />}
          {busy ? (slow ? t('notes.submittingSlow') : t('notes.submitting')) : t('notes.submit')}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          {t('notes.cancel')}
        </button>
        {onReanalyze && (
          <button type="button" onClick={reanalyze} disabled={analyzing} className="btn">
            {analyzing ? (
              <span aria-hidden="true" className="spinner" />
            ) : (
              <Icon name="spark" size={16} className="text-accent" />
            )}
            {analyzing
              ? t(slowReanalyze ? 'notes.reanalyzingSlow' : 'notes.reanalyzing')
              : t('notes.reanalyze')}
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} className="btn btn-ghost btn-danger ms-auto">
            <Icon name="trash" size={16} />
            {t('notes.delete')}
          </button>
        )}
      </div>
    </form>
  );
}
