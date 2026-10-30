import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_NOTE_SORT,
  EMPTY_FILTER,
  NoteSort,
  filterNotes,
  sortNotes,
  NoteCreated,
  type NoteFilter,
  MAX_TITLE_LENGTH,
  suggestionOf,
} from '@notes/shared';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useMatch, useNavigate } from 'react-router';
import { api, ApiNetworkError } from '../../lib/api';
import type { ImportResult } from '../import/ImportDialog';
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
import { ROUTES, notePath, useGoBack } from '../shell/routes';
import { Loading } from '../../ui/Loading';
import { Icon } from '../../ui/Icon';
import { Toast } from '../../ui/Toast';
import { NoteEditor } from './NoteEditor';
import { NoteFilters } from './NoteFilters';
import { NoteList } from './NoteList';
import { VoiceRecorder } from './VoiceRecorder';

// Chat and import open only on request, so they load in their own chunks. Hovering or focusing
// the chat button starts the chat download early.
const loadChat = () => import('../chat/ChatPanel');
const ChatPanel = lazy(() => loadChat().then((m) => ({ default: m.ChatPanel })));
const ImportDialog = lazy(() =>
  import('../import/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

const UNDO_MS = 5000;
const inputDir = (value: string) => (value.trim() ? 'auto' : 'rtl');

/** The client's local date as YYYY-MM-DD. */
const localToday = () => new Date().toLocaleDateString('en-CA');

export function NotesScreen({
  initialTagId = null,
}: {
  /** Start with the list filtered to this tag. */
  initialTagId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  // A share from another app opens the add-note editor with the shared text.
  const [shared] = useState(peekSharedNote);
  useEffect(clearSharedNote, []);
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { pathname, search, state } = useLocation();
  const chatOpen = pathname === ROUTES.chat;
  const importing = pathname === ROUTES.import;
  const editId = useMatch('/notes/:id')?.params.id;
  // Each page keeps the list's `?tag=` so the filtered list stays mounted behind it.
  const open = (to: string, replace = false, draft?: NoteCreated) =>
    void navigate({ pathname: to, search }, { replace, state: draft });
  const [text, setText] = useState(shared ?? '');
  const [title, setTitle] = useState('');
  const notes = useQuery({ queryKey: ['notes'], queryFn: api.notes });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: api.taxonomy });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoteFilter>(
    initialTagId === null ? EMPTY_FILTER : { ...EMPTY_FILTER, tagIds: [initialTagId] },
  );
  const saveSort = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  const meta = (clientId: string = crypto.randomUUID()) => ({
    clientId,
    today: localToday(),
    locale: i18n.language === 'en' ? ('en' as const) : ('he' as const),
  });
  /** The draft is ready: review it. From compose it replaces the page, so back returns to the list. */
  const onDraft = async (draft: NoteCreated, fromCompose = true) => {
    await queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
    open(ROUTES.review, fromCompose, draft);
  };
  const online = useOnline();
  const [outbox, setOutbox] = useState(readOutbox);
  const [outboxDismissed, setOutboxDismissed] = useState(false);
  const waiting = !online && outbox.length > 0 && (
    <section aria-labelledby="pending-title" className="flex flex-col gap-2">
      <h3 id="pending-title" className="text-sm font-semibold text-muted">
        {t('offline.pending', { count: outbox.length })}
      </h3>
      <ul className="flex flex-col gap-2">
        {outbox.map((e) => (
          <li key={e.clientId} dir="auto" className="card p-3 text-sm">
            {e.body || t('offline.voiceNote')}
          </li>
        ))}
      </ul>
    </section>
  );
  const [offlineNotice, setOfflineNotice] = useState<'saved' | 'failed' | null>(null);

  /** Queue a note on the device instead of sending it. */
  const saveOffline = async (
    body: string,
    audio?: Blob,
    clientId: string = crypto.randomUUID(),
    title: string = '',
  ) => {
    const ok = await addToOutbox({ clientId, body, ...(title.trim() ? { title } : {}) }, audio);
    setOutbox(readOutbox());
    setOfflineNotice(ok ? 'saved' : 'failed');
    if (ok) {
      setText('');
      setTitle('');
      goBack();
    }
  };
  /** A network-level failure (no HTTP answer) means we are offline after all. Keeps the clientId so a retry is safe. */
  const queueOnNetworkError = async (
    err: unknown,
    body: string,
    clientId: string,
    audio?: Blob,
    title?: string,
  ) => {
    if (err instanceof ApiNetworkError) {
      reportNetworkFailure();
      await saveOffline(body, audio, clientId, title);
    }
  };
  const create = useMutation({
    mutationFn: ({ body, title, clientId }: { body: string; title: string; clientId: string }) =>
      api.createNote({ body, ...(title.trim() ? { title } : {}), ...meta(clientId) }),
    onSuccess: (draft) => onDraft(draft),
    onError: (err, vars) =>
      queueOnNetworkError(err, vars.body, vars.clientId, undefined, vars.title),
  });
  const createVoice = useMutation({
    mutationFn: ({ audio, title, clientId }: { audio: Blob; title: string; clientId: string }) =>
      api.createVoiceNote(audio, { ...(title.trim() ? { title } : {}), ...meta(clientId) }),
    onSuccess: (draft) => onDraft(draft),
    onError: (err, vars) => queueOnNetworkError(err, '', vars.clientId, vars.audio, vars.title),
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
      draft = await api.createVoiceNote(audio, {
        ...(entry.title ? { title: entry.title } : {}),
        ...queued,
      });
    } else {
      draft = await api.createNote({
        body,
        ...(entry.title ? { title: entry.title } : {}),
        ...queued,
      });
    }
    await removeFromOutbox(entry.clientId);
    setOutbox(readOutbox());
    await onDraft(draft, false);
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
      setTitle('');
      goBack();
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteNote,
    onSuccess: async (_, id) => {
      // Leave the editor before the refetch can drop the note and redirect over it.
      goBack();
      setUndoId(id);
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
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

  // The "saved on this device" toast has done its job once the queue has been sent.
  const offlineToast = offlineNotice !== null &&
    !(offlineNotice === 'saved' && outbox.length === 0) && (
      <Toast
        // Only the "saved" notice closes by itself; a failure stays until the user dismisses it.
        onClose={offlineNotice === 'saved' ? () => setOfflineNotice(null) : undefined}
        actions={
          <button type="button" onClick={() => setOfflineNotice(null)} className="btn btn-sm">
            {t('offline.dismiss')}
          </button>
        }
      >
        {t(offlineNotice === 'saved' ? 'offline.saved' : 'offline.saveFailed')}
      </Toast>
    );

  if (pathname === ROUTES.compose) {
    return (
      <form
        className="enter-rise flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (online) create.mutate({ body: text, title, clientId: crypto.randomUUID() });
          else void saveOffline(text, undefined, undefined, title);
        }}
      >
        <h2 className="text-2xl font-bold tracking-tight">{t('notes.add')}</h2>
        {!online && (
          <p role="status" className="notice notice-info">
            {t('offline.banner')}
          </p>
        )}
        <div className="card flex flex-col gap-3 p-3 transition-[box-shadow] duration-150 has-[:focus-visible]:shadow-[0_0_0_2px_var(--accent)]">
          <div className="border-b border-line pb-3">
            <VoiceRecorder
              onSend={(audio) =>
                online
                  ? createVoice.mutate({ audio, title, clientId: crypto.randomUUID() })
                  : void saveOffline('', audio, undefined, title)
              }
              pending={createVoice.isPending}
              failed={createVoice.isError}
            />
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            dir={inputDir(title)}
            aria-label={t('notes.noteTitle')}
            placeholder={t('notes.noteTitle')}
            className="w-full bg-transparent px-1 py-1 text-[1.0625rem] font-semibold outline-none placeholder:font-normal placeholder:text-muted focus-visible:outline-none"
          />
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            dir={inputDir(text)}
            aria-label={t('notes.body')}
            placeholder={t('notes.placeholder')}
            className="w-full resize-none bg-transparent px-1 py-1 text-[1.0625rem] leading-relaxed outline-none placeholder:text-muted focus-visible:outline-none"
          />
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
          <button type="button" onClick={goBack} className="btn btn-ghost">
            {t('notes.cancel')}
          </button>
        </div>
        <p className="text-sm text-muted">{t('notes.suggestHint')}</p>
      </form>
    );
  }

  if (!notes.data || !taxonomy.data) {
    if (notes.isError || taxonomy.isError || !online) {
      return (
        <section className="flex flex-col items-start gap-4">
          {online ? (
            <p role="alert" className="notice notice-danger">
              {t('notes.error')}
            </p>
          ) : (
            <p role="status" className="notice notice-info">
              {t('offline.noData')}
            </p>
          )}
          <button type="button" onClick={() => open(ROUTES.compose)} className="btn btn-primary">
            <Icon name="plus" size={18} />
            {t('notes.add')}
          </button>
          {waiting}
          <div className="toast-stack">{offlineToast}</div>
        </section>
      );
    }
    return <Loading label={t('status.checking')} />;
  }

  if (pathname === ROUTES.review || editId !== undefined) {
    // History state survives a reload, so it is untrusted like any other input.
    const parsed = pathname === ROUTES.review ? NoteCreated.safeParse(state) : undefined;
    if (parsed && !parsed.success) return <Navigate to={ROUTES.notes} replace />;
    const edited = notes.data.find((n) => n.id === editId);
    if (!parsed && !edited) return <Navigate to={ROUTES.notes} replace />;
    const note = parsed?.success ? parsed.data.note : edited;
    if (!note) return <Navigate to={ROUTES.notes} replace />;
    return (
      <NoteEditor
        key={note.id}
        note={note}
        suggestion={parsed?.success ? parsed.data.suggestion : suggestionOf(note)}
        taxonomy={taxonomy.data}
        busy={submit.isPending}
        failed={submit.isError || remove.isError}
        onSubmit={(edit) => submit.mutate({ id: note.id, edit })}
        onCancel={goBack}
        onReanalyze={() => reanalyze(note.id)}
        onDelete={() => remove.mutate(note.id)}
        attachable
      />
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
        <Suspense fallback={<Loading label={t('import.loading')} />}>
          <ImportDialog
            taxonomy={taxonomy.data}
            today={today}
            locale={locale}
            onClose={goBack}
            onImported={(result) => {
              goBack();
              setImported(result);
              void queryClient.invalidateQueries({ queryKey: ['notes'] });
              void queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
            }}
          />
        </Suspense>
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
          <button
            type="button"
            onClick={() => open(ROUTES.chat)}
            onPointerEnter={() => void loadChat()}
            onFocus={() => void loadChat()}
            className="btn"
          >
            <Icon name="spark" size={16} className="text-accent" />
            {t('chat.open')}
          </button>
          <div
            aria-hidden="true"
            className="bg-bg fixed inset-x-0 bottom-0 z-10 h-[calc(6rem+env(safe-area-inset-bottom))] sm:hidden"
          />
          <button
            type="button"
            onClick={() => open(ROUTES.compose)}
            className="btn btn-primary sm:min-h-11 sm:px-5 max-sm:fixed max-sm:left-1/2 max-sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] max-sm:z-20 max-sm:h-16 max-sm:-translate-x-1/2 max-sm:rounded-2xl max-sm:px-8 max-sm:text-lg max-sm:shadow-[0_10px_28px_-8px_color-mix(in_oklab,var(--accent)_55%,transparent)]"
          >
            <Icon name="plus" size={22} />
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
      {waiting}
      <div className="max-sm:pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <NoteList
          notes={visible}
          filtered={notes.data.length > 0}
          taxonomy={taxonomy.data}
          today={today}
          onOpen={(note) => open(notePath(note.id))}
          onAdd={() => open(ROUTES.compose)}
        />
      </div>
      {undo.isError && (
        <p role="alert" className="notice notice-danger">
          {t('notes.error')}
        </p>
      )}
      {chatOpen && (
        <Suspense fallback={<Loading label={t('chat.loading')} />}>
          <ChatPanel
            notes={notes.data}
            onOpenNote={(note) => {
              open(notePath(note.id), true);
            }}
            onClose={goBack}
            onTaxonomyChanged={() => {
              void queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
              void queryClient.invalidateQueries({ queryKey: ['notes'] });
            }}
          />
        </Suspense>
      )}
      <div className="toast-stack">
        {imported && (
          <Toast
            onClose={() => setImported(null)}
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
        {offlineToast}
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
      </div>
    </section>
  );
}
