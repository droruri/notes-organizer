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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { ChatPanel } from '../chat/ChatPanel';
import { ImportDialog, type ImportResult } from '../import/ImportDialog';
import { OutboxDialog } from '../offline/OutboxDialog';
import {
  addToOutbox,
  readOutbox,
  readOutboxAudio,
  removeFromOutbox,
  type OutboxEntry,
} from '../offline/outbox';
import { reportNetworkFailure, useOnline } from '../offline/useOnline';
import { clearSharedNote, peekSharedNote } from '../share/shareTarget';
import { Loading } from '../../ui/Loading';
import { Icon } from '../../ui/Icon';
import { Toast } from '../../ui/Toast';
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

export function NotesScreen({
  importing,
  onImportClose,
}: {
  importing: boolean;
  onImportClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  // A share from another app opens the add-note editor with the shared text.
  const [shared] = useState(peekSharedNote);
  useEffect(clearSharedNote, []);
  const [mode, setMode] = useState<Mode>({ kind: shared === undefined ? 'list' : 'compose' });
  const [text, setText] = useState(shared ?? '');
  const notes = useQuery({ queryKey: ['notes'], queryFn: api.notes });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: api.taxonomy });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [chatOpen, setChatOpen] = useState(false);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoteFilter>(EMPTY_FILTER);
  const saveSort = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  const meta = (clientId: string = crypto.randomUUID()) => ({
    clientId,
    today: localToday(),
    locale: i18n.language === 'en' ? ('en' as const) : ('he' as const),
  });
  const onDraft = async (draft: NoteCreated) => {
    await queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
    setMode({ kind: 'review', draft });
  };
  const online = useOnline();
  const [outbox, setOutbox] = useState(readOutbox);
  const [outboxDismissed, setOutboxDismissed] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<'saved' | 'failed' | null>(null);

  /** Queue a note on the device instead of sending it. */
  const saveOffline = async (
    body: string,
    audio?: Blob,
    clientId: string = crypto.randomUUID(),
  ) => {
    const ok = await addToOutbox({ clientId, body }, audio);
    setOutbox(readOutbox());
    setOfflineNotice(ok ? 'saved' : 'failed');
    if (ok) {
      setText('');
      setMode({ kind: 'list' });
    }
  };
  /** A network-level failure (no HTTP answer) means we are offline after all. Keeps the clientId so a retry is safe. */
  const queueOnNetworkError = async (
    err: unknown,
    body: string,
    clientId: string,
    audio?: Blob,
  ) => {
    if (err instanceof TypeError) {
      reportNetworkFailure();
      await saveOffline(body, audio, clientId);
    }
  };
  const create = useMutation({
    mutationFn: ({ body, clientId }: { body: string; clientId: string }) =>
      api.createNote({ body, ...meta(clientId) }),
    onSuccess: onDraft,
    onError: (err, vars) => queueOnNetworkError(err, vars.body, vars.clientId),
  });
  const createVoice = useMutation({
    mutationFn: ({ audio, clientId }: { audio: Blob; clientId: string }) =>
      api.createVoiceNote(audio, meta(clientId)),
    onSuccess: onDraft,
    onError: (err, vars) => queueOnNetworkError(err, '', vars.clientId, vars.audio),
  });

  /** Send one queued note with its own `clientId`; it leaves the outbox only after success. */
  const sendQueued = async (entry: OutboxEntry, body: string) => {
    const queued = meta(entry.clientId);
    let draft: NoteCreated;
    if (entry.hasAudio) {
      const audio = await readOutboxAudio(entry.clientId);
      if (!audio) {
        // The recording is gone, so this note can never be sent; drop it instead of leaving it stuck.
        console.warn('outbox: recording missing; dropping note');
        await removeFromOutbox(entry.clientId);
        setOutbox(readOutbox());
        return;
      }
      draft = await api.createVoiceNote(audio, queued);
    } else {
      draft = await api.createNote({ body, ...queued });
    }
    await removeFromOutbox(entry.clientId);
    setOutbox(readOutbox());
    await onDraft(draft);
  };
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
      <p role="alert" className="notice notice-danger">
        {t('notes.error')}
      </p>
    ) : (
      <Loading label={t('status.checking')} />
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
        className="enter-rise flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (online) create.mutate({ body: text, clientId: crypto.randomUUID() });
          else void saveOffline(text);
        }}
      >
        <h2 className="text-2xl font-bold tracking-tight">{t('notes.add')}</h2>
        {!online && (
          <p role="status" className="notice notice-info">
            {t('offline.banner')}
          </p>
        )}
        <div className="card flex flex-col gap-3 p-3 transition-[box-shadow] duration-150 has-[textarea:focus-visible]:shadow-[0_0_0_2px_var(--accent)]">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            dir="auto"
            aria-label={t('notes.body')}
            placeholder={t('notes.placeholder')}
            className="w-full resize-none bg-transparent px-1 py-1 text-[1.0625rem] leading-relaxed outline-none placeholder:text-muted focus-visible:outline-none"
          />
          <div className="border-t border-line pt-3">
            <VoiceRecorder
              onSend={(audio) =>
                online
                  ? createVoice.mutate({ audio, clientId: crypto.randomUUID() })
                  : void saveOffline('', audio)
              }
              pending={createVoice.isPending}
              failed={createVoice.isError}
            />
          </div>
        </div>
        {offlineNotice === 'failed' && (
          <p role="alert" className="notice notice-danger">
            {t('offline.saveFailed')}
          </p>
        )}
        {create.isError && (
          <p role="alert" className="notice notice-danger">
            {t('notes.error')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={create.isPending || text.trim() === ''}
            className="btn btn-primary"
          >
            {create.isPending ? (
              <span aria-hidden="true" className="spinner" />
            ) : (
              <Icon name="spark" size={16} />
            )}
            {create.isPending ? t('notes.suggesting') : t('notes.suggest')}
          </button>
          <button type="button" onClick={() => setMode({ kind: 'list' })} className="btn btn-ghost">
            {t('notes.cancel')}
          </button>
        </div>
        <p className="text-sm text-muted">{t('notes.suggestHint')}</p>
      </form>
    );
  }

  const today = localToday();
  const sort = settings.data?.noteSort ?? DEFAULT_NOTE_SORT;
  const visible = sortNotes(filterNotes(notes.data, filter, today), sort, today);
  const locale = i18n.language === 'en' ? ('en' as const) : ('he' as const);
  return (
    <section className="flex flex-col gap-5">
      {online && !outboxDismissed && outbox.length > 0 && (
        <OutboxDialog
          entries={outbox}
          taxonomy={taxonomy.data}
          onSend={sendQueued}
          onClose={() => setOutboxDismissed(true)}
        />
      )}
      {importing && (
        <ImportDialog
          taxonomy={taxonomy.data}
          today={today}
          locale={locale}
          onClose={onImportClose}
          onImported={(result) => {
            onImportClose();
            setImported(result);
            void queryClient.invalidateQueries({ queryKey: ['notes'] });
            void queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
          }}
        />
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">
            {t('notes.title')}
          </h2>
          <p className="text-sm text-muted tabular-nums">
            {t('notes.count', { count: visible.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setChatOpen(true)} className="btn">
            <Icon name="spark" size={16} className="text-accent" />
            {t('chat.open')}
          </button>
          <button
            type="button"
            onClick={() => setMode({ kind: 'compose' })}
            className="btn btn-primary max-sm:fixed max-sm:end-4 max-sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] max-sm:z-20 max-sm:h-14 max-sm:rounded-2xl max-sm:px-5 max-sm:shadow-[0_10px_28px_-8px_rgb(11_92_120/0.55)]"
          >
            <Icon name="plus" size={18} />
            {t('notes.add')}
          </button>
        </div>
      </div>
      <NoteFilters
        filter={filter}
        onChange={setFilter}
        taxonomy={taxonomy.data}
        sort={
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="shrink-0">{t('notes.sort.label')}</span>
            <select
              value={sort}
              onChange={(e) => {
                const next = NoteSort.safeParse(e.target.value);
                if (next.success) saveSort.mutate({ noteSort: next.data });
              }}
              className="field min-h-9 w-auto py-1 text-sm text-fg"
            >
              {NoteSort.options.map((o) => (
                <option key={o} value={o}>
                  {t(`notes.sort.${o}`)}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {saveSort.isError && (
        <p role="alert" className="notice notice-danger">
          {t('notes.error')}
        </p>
      )}
      <NoteList
        notes={visible}
        filtered={notes.data.length > 0}
        taxonomy={taxonomy.data}
        today={today}
        onOpen={(note) => setMode({ kind: 'edit', note })}
        onAdd={() => setMode({ kind: 'compose' })}
      />
      {undo.isError && (
        <p role="alert" className="notice notice-danger">
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
        <Toast
          actions={
            <>
              {imported.unreadNotes > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter({ ...EMPTY_FILTER, unreadLinksOnly: true });
                    setImported(null);
                  }}
                  className="btn btn-sm"
                >
                  {t('import.show')}
                </button>
              )}
              <button type="button" onClick={() => setImported(null)} className="btn btn-sm">
                {t('import.dismiss')}
              </button>
            </>
          }
        >
          {imported.unreadNotes > 0
            ? t('import.toastUnread', {
                notes: imported.created.notes,
                count: imported.unreadNotes,
              })
            : t('import.done', { count: imported.created.notes })}
        </Toast>
      )}
      {offlineNotice !== null && (
        <Toast
          actions={
            <button type="button" onClick={() => setOfflineNotice(null)} className="btn btn-sm">
              {t('offline.dismiss')}
            </button>
          }
        >
          {t(offlineNotice === 'saved' ? 'offline.saved' : 'offline.saveFailed')}
        </Toast>
      )}
      {undoId !== null && (
        <Toast
          actions={
            <button type="button" onClick={() => undo.mutate(undoId)} className="btn btn-sm">
              {t('notes.undo')}
            </button>
          }
        >
          {t('notes.deleted')}
        </Toast>
      )}
    </section>
  );
}
