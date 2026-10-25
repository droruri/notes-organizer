import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_NOTE_SORT,
  EMPTY_FILTER,
  NoteSort,
  filterNotes,
  sortNotes,
  type NoteCreated,
  type Note,
  type NoteFilter,
  type Suggestion,
} from '@notes/shared';
import { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { ChatPanel } from '../chat/ChatPanel';
import { ImportDialog, type ImportResult } from '../import/ImportDialog';
import { ImportMenu } from '../import/ImportMenu';
import { HeaderSlot } from '../shell/headerSlot';
import { NoteEditor } from './NoteEditor';
import { NoteFilters } from './NoteFilters';
import { NoteList } from './NoteList';
import { VoiceRecorder } from './VoiceRecorder';

type Mode =
  | { kind: 'list' }
  | { kind: 'compose' }
  | { kind: 'review'; draft: NoteCreated }
  | { kind: 'edit'; note: Note };

const UNDO_MS = 5000;

const suggestionOf = (note: Note): Suggestion => ({
  categoryIds: note.categoryIds,
  tagIds: note.tagIds,
  newCategories: note.proposed?.newCategories ?? [],
  newTags: note.proposed?.newTags ?? [],
  dueDate: note.dueDate,
  importance: note.importance,
  urgency: note.urgency,
  unreadLinks: note.unreadLinks,
});

/** The client's local date as YYYY-MM-DD. */
const localToday = () => new Date().toLocaleDateString('en-CA');

export function NotesScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [text, setText] = useState('');
  const notes = useQuery({ queryKey: ['notes'], queryFn: api.notes });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: api.taxonomy });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [chatOpen, setChatOpen] = useState(false);
  const slot = useContext(HeaderSlot);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoteFilter>(EMPTY_FILTER);
  const saveSort = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  const meta = () => ({
    clientId: crypto.randomUUID(),
    today: localToday(),
    locale: i18n.language === 'en' ? ('en' as const) : ('he' as const),
  });
  const onDraft = async (draft: NoteCreated) => {
    await queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
    setMode({ kind: 'review', draft });
  };
  const create = useMutation({
    mutationFn: (body: string) => api.createNote({ body, ...meta() }),
    onSuccess: onDraft,
  });
  const createVoice = useMutation({
    mutationFn: (audio: Blob) => api.createVoiceNote(audio, meta()),
    onSuccess: onDraft,
  });
  const submit = useMutation({
    mutationFn: ({ id, edit }: { id: string; edit: Parameters<typeof api.updateNote>[1] }) =>
      api.updateNote(id, edit),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notes'] }),
        queryClient.invalidateQueries({ queryKey: ['taxonomy'] }),
      ]);
      setText('');
      setMode({ kind: 'list' });
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteNote,
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      setMode({ kind: 'list' });
      setUndoId(id);
    },
  });
  const undo = useMutation({
    mutationFn: api.restoreNote,
    onSuccess: async () => {
      setUndoId(null);
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: () => setUndoId(null),
  });
  useEffect(() => {
    if (undoId === null) return;
    const timer = setTimeout(() => setUndoId(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoId]);

  const reanalyze = (id: string) =>
    api.analyzeNote(id, { today: localToday(), locale: i18n.language === 'en' ? 'en' : 'he' });

  if (!notes.data || !taxonomy.data) {
    return notes.isError || taxonomy.isError ? (
      <p role="alert" className="text-danger">
        {t('notes.error')}
      </p>
    ) : (
      <p className="text-muted">{t('status.checking')}</p>
    );
  }

  if (mode.kind === 'review' || mode.kind === 'edit') {
    const note = mode.kind === 'review' ? mode.draft.note : mode.note;
    return (
      <NoteEditor
        key={note.id}
        note={note}
        suggestion={mode.kind === 'review' ? mode.draft.suggestion : suggestionOf(note)}
        taxonomy={taxonomy.data}
        busy={submit.isPending}
        failed={submit.isError || remove.isError}
        onSubmit={(edit) => submit.mutate({ id: note.id, edit })}
        onCancel={() => setMode({ kind: 'list' })}
        onReanalyze={() => reanalyze(note.id)}
        onDelete={() => remove.mutate(note.id)}
      />
    );
  }

  if (mode.kind === 'compose') {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) create.mutate(text);
        }}
      >
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          aria-label={t('notes.body')}
          placeholder={t('notes.placeholder')}
          className="rounded-md border border-line bg-bg px-2 py-1"
        />
        {create.isError && (
          <p role="alert" className="text-danger">
            {t('notes.error')}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={create.isPending || text.trim() === ''}
            className="rounded-md bg-fg px-4 py-2 text-bg disabled:opacity-50"
          >
            {create.isPending ? t('notes.suggesting') : t('notes.suggest')}
          </button>
          <button
            type="button"
            onClick={() => setMode({ kind: 'list' })}
            className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover"
          >
            {t('notes.cancel')}
          </button>
        </div>
        <VoiceRecorder
          onSend={(audio) => createVoice.mutate(audio)}
          pending={createVoice.isPending}
          failed={createVoice.isError}
        />
      </form>
    );
  }

  const today = localToday();
  const sort = settings.data?.noteSort ?? DEFAULT_NOTE_SORT;
  const visible = sortNotes(filterNotes(notes.data, filter, today), sort, today);
  const locale = i18n.language === 'en' ? ('en' as const) : ('he' as const);
  return (
    <section className="flex flex-col gap-4">
      {slot && createPortal(<ImportMenu onImport={() => setImporting(true)} />, slot)}
      {importing && (
        <ImportDialog
          taxonomy={taxonomy.data}
          today={today}
          locale={locale}
          onClose={() => setImporting(false)}
          onImported={(result) => {
            setImporting(false);
            setImported(result);
            void queryClient.invalidateQueries({ queryKey: ['notes'] });
            void queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
          }}
        />
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('notes.title')}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover"
          >
            {t('chat.open')}
          </button>
          <button
            type="button"
            onClick={() => setMode({ kind: 'compose' })}
            className="rounded-md bg-fg px-4 py-2 text-bg"
          >
            {t('notes.add')}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <NoteFilters filter={filter} onChange={setFilter} taxonomy={taxonomy.data} />
        <label className="flex items-center gap-2 text-sm">
          {t('notes.sort.label')}
          <select
            value={sort}
            onChange={(e) => {
              const next = NoteSort.safeParse(e.target.value);
              if (next.success) saveSort.mutate({ noteSort: next.data });
            }}
            className="rounded-md border border-line bg-bg px-2 py-1"
          >
            {NoteSort.options.map((o) => (
              <option key={o} value={o}>
                {t(`notes.sort.${o}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {saveSort.isError && (
        <p role="alert" className="text-danger">
          {t('notes.error')}
        </p>
      )}
      <NoteList
        notes={visible}
        taxonomy={taxonomy.data}
        today={today}
        onOpen={(note) => setMode({ kind: 'edit', note })}
      />
      {undo.isError && (
        <p role="alert" className="text-danger">
          {t('notes.error')}
        </p>
      )}
      {chatOpen && (
        <ChatPanel
          notes={notes.data}
          onOpenNote={(note) => {
            setChatOpen(false);
            setMode({ kind: 'edit', note });
          }}
          onClose={() => setChatOpen(false)}
          onTaxonomyChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            void queryClient.invalidateQueries({ queryKey: ['notes'] });
          }}
        />
      )}
      {imported && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-bg p-3 shadow-lg"
        >
          {imported.unreadNotes > 0
            ? t('import.toastUnread', {
                notes: imported.created.notes,
                count: imported.unreadNotes,
              })
            : t('import.done', { count: imported.created.notes })}
          <span className="flex gap-2">
            {imported.unreadNotes > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilter({ ...EMPTY_FILTER, unreadLinksOnly: true });
                  setImported(null);
                }}
                className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
              >
                {t('import.show')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setImported(null)}
              className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
            >
              {t('import.dismiss')}
            </button>
          </span>
        </div>
      )}
      {undoId !== null && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-bg p-3 shadow-lg"
        >
          {t('notes.deleted')}
          <button
            type="button"
            onClick={() => undo.mutate(undoId)}
            className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
          >
            {t('notes.undo')}
          </button>
        </div>
      )}
    </section>
  );
}
