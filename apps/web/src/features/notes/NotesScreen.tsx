import {
  DEFAULT_NOTE_SORT,
  DEFAULT_QUICK_ACTIONS,
  QuickAction,
  EMPTY_FILTER,
  NoteSort,
  filterNotes,
  sortNotes,
  NoteCreated,
  type NoteEdit,
  type Note,
  type NoteFilter,
  type NoteStatus,
  DEFAULT_NOTE_FORM,
  type Workspace,
  suggestionOf,
} from '@notes/shared';
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Navigate, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router';
import {
  useChangeNoteStatus,
  useCreateNote,
  useCreateVoiceNote,
  useDeleteNote,
  useEditWorkspace,
  useFilterFromText,
  useNotes,
  useRefreshNotes,
  useRestoreNote,
  useSaveSettings,
  useSettings,
  useSnoozeNote,
  useTaxonomy,
  useToggleNoteChecklist,
  useToggleNoteItem,
  useUpdateNote,
  useWorkspaces,
} from '../../api';
import { ApiNetworkError } from '../../lib/api';
import type { ImportResult } from '../import/ImportDialog';
import {
  addToOutbox,
  readOutbox,
  readOutboxAudio,
  removeFromOutbox,
  type OutboxEntry,
} from '../offline/outbox';
import { reportNetworkFailure, useOnline } from '../offline/useOnline';
import { clearSharedNote, peekSharedNote } from '../share/shareTarget';
import { ROUTES, editPath, notePath, useGoBack } from '../shell/routes';
import { Loading } from '../../ui/Loading';
import { Icon } from '../../ui/Icon';
import { Panes } from '../../ui/Panes';
import { Toast } from '../../ui/Toast';
import { useScrolledPast } from '../../ui/useScrolledPast';
import { pushWithTransition, useViewTransitionCommit } from '../../ui/viewTransition';
import { loadEditor } from './loadEditor';
import { NoteView } from './NoteView';
import { NoteFilters } from './NoteFilters';
import { ContinueRow } from './ContinueRow';
import { CategoryStrip } from './CategoryStrip';
import { TodayList } from './TodayList';
import { todayCount, todayGroups } from './todayGroups';
import { rankCategories } from './categoryRank';
import { toggleItem } from './checklist';
import { formatDate } from './formatDate';
import { NoteList } from './NoteList';
import { recordOpen } from './recent';
import { ComposeForm } from './ComposeForm';
import { useEscape } from '../../ui/useEscape';
import { shouldCloseOnEscape, useNoteShortcuts } from './useNoteShortcuts';

// The editor, outbox, chat and import open only on request, so they load in their own chunks.
// Hovering or focusing a note (or the chat button) starts that download early.
const NoteEditor = lazy(() => loadEditor().then((m) => ({ default: m.NoteEditor })));
const OutboxDialog = lazy(() =>
  import('../offline/OutboxDialog').then((m) => ({ default: m.OutboxDialog })),
);
const loadChat = () => import('../chat/ChatPanel');
const ChatPanel = lazy(() => loadChat().then((m) => ({ default: m.ChatPanel })));
const ImportDialog = lazy(() =>
  import('../import/ImportDialog').then((m) => ({ default: m.ImportDialog })),
);

const UNDO_MS = 5000;

/** Compose, review and edit slide in as pushed screens. */
const isPushed = (to: string) =>
  to === ROUTES.compose || to === ROUTES.review || to.startsWith(notePath(''));

/** The client's local date as YYYY-MM-DD. */
const localToday = () => new Date().toLocaleDateString('en-CA');

/** Key-order-independent equality for two filters (their values are plain JSON). */
function sameFilter(a: NoteFilter, b: NoteFilter): boolean {
  const canon = (f: NoteFilter) =>
    JSON.stringify(Object.entries(f).sort(([x], [y]) => x.localeCompare(y)));
  return canon(a) === canon(b);
}

export function NotesScreen({
  initialTagId = null,
  workspace,
  onWorkspaces,
}: {
  /** Start with the list filtered to this tag. */
  initialTagId?: string | null;
  /** The current workspace: new notes go there and the list shows only its notes. */
  workspace?: Workspace;
  /** Opens the workspaces sheet (the Workspaces quick action). */
  onWorkspaces?: () => void;
}) {
  const { t, i18n } = useTranslation();
  // A share from another app opens the add-note editor with the shared text.
  const [shared] = useState(peekSharedNote);
  useEffect(clearSharedNote, []);
  const navigate = useNavigate();
  const goBack = useGoBack();
  const [titleSentinel, titleCollapsed] = useScrolledPast<HTMLDivElement>();
  const { pathname, search, state } = useLocation();
  // The URL is untrusted: only exactly `view=today` switches the list to the Today view.
  const todayMode = useSearchParams()[0].get('view') === 'today';
  const chatOpen = pathname === ROUTES.chat;
  const importing = pathname === ROUTES.import;
  const editId = useMatch('/notes/:id/edit')?.params.id;
  const viewId = useMatch('/notes/:id')?.params.id;
  const openId = editId ?? viewId;
  useEffect(() => {
    if (openId !== undefined) recordOpen(openId);
  }, [openId]);
  const detailOpen =
    pathname === ROUTES.compose || pathname === ROUTES.review || openId !== undefined;
  // Each page keeps the list's `?tag=` so the filtered list stays mounted behind it.
  useViewTransitionCommit(pathname);
  const open = (to: string, replace = false, routeState?: NoteCreated | { record: true }) => {
    const go = () => void navigate({ pathname: to, search }, { replace, state: routeState });
    if (isPushed(to)) pushWithTransition(go);
    else go();
  };
  // History state is untrusted: only a well-formed `{ record: true }` auto-starts the recorder.
  const autoRecord = z.object({ record: z.literal(true) }).safeParse(state).success;
  const [text, setText] = useState(shared ?? '');
  const [title, setTitle] = useState('');
  const notes = useNotes();
  const taxonomy = useTaxonomy();
  const settings = useSettings();
  const workspaces = useWorkspaces();
  // Mobile quick actions next to "New Note", in canonical order; the default while settings load.
  const quickActions = QuickAction.options.filter(
    (a) =>
      (settings.data?.quickActions ?? DEFAULT_QUICK_ACTIONS).includes(a) &&
      (a !== 'workspaces' || onWorkspaces),
  );
  const quickHandlers: Record<QuickAction, () => void> = {
    workspaces: () => onWorkspaces?.(),
    record: () => open(ROUTES.compose, false, { record: true }),
    import: () => open(ROUTES.import),
  };
  const quickMeta: Record<QuickAction, { icon: 'layers' | 'mic' | 'upload'; label: string }> = {
    workspaces: { icon: 'layers', label: t('workspaces.menu') },
    record: { icon: 'mic', label: t('voice.record') },
    import: { icon: 'upload', label: t('import.open') },
  };
  // Name of the workspace a note was just saved in, when it is not the current one.
  const [savedIn, setSavedIn] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [filter, setFilter] = useState<NoteFilter>(
    initialTagId === null
      ? { ...EMPTY_FILTER, ...workspace?.defaultFilter }
      : { ...EMPTY_FILTER, tagIds: [initialTagId] },
  );
  // Search text lags the input so typing stays responsive while every body is scanned.
  const deferredText = useDeferredValue(filter.text);
  // Smart search: the sentence becomes a filter. `understood` is that filter object, so any edit
  // (a new object) drops the "הבנתי:" label; the notice belongs to the text it was raised for.
  const [smartPending, setSmartPending] = useState(false);
  const [understood, setUnderstood] = useState<NoteFilter | null>(null);
  const [smartNotice, setSmartNotice] = useState<{
    kind: 'offline' | 'failed';
    text: string;
  } | null>(null);
  const smartMutation = useFilterFromText();
  const smartSearch = (text: string) => {
    if (!online) {
      setSmartNotice({ kind: 'offline', text: filter.text });
      return;
    }
    setSmartNotice(null);
    setSmartPending(true);
    smartMutation.mutate(
      { text, today: localToday(), locale: i18n.language === 'en' ? 'en' : 'he' },
      {
        onSuccess: (res) => {
          setFilter(res.filter);
          setUnderstood(res.filter);
        },
        onError: (err) => {
          if (err instanceof ApiNetworkError) reportNetworkFailure();
          setSmartNotice({ kind: 'failed', text: filter.text });
        },
        onSettled: () => setSmartPending(false),
      },
    );
  };
  // Apply a workspace's saved default when the workspace changes (adjusting state during render,
  // so open child routes are not remounted).
  const [appliedFor, setAppliedFor] = useState(workspace?.id);
  if (workspace?.id !== appliedFor) {
    setAppliedFor(workspace?.id);
    setFilter({ ...EMPTY_FILTER, ...workspace?.defaultFilter });
  }
  const editWorkspace = useEditWorkspace();
  const saveSort = useSaveSettings();

  const meta = (clientId: string = crypto.randomUUID(), workspaceId = workspace?.id) => ({
    clientId,
    ...(workspaceId ? { workspaceId } : {}),
    today: localToday(),
    locale: i18n.language === 'en' ? ('en' as const) : ('he' as const),
  });
  /** The draft is ready: review it. From compose it replaces the page, so back returns to the list. */
  const onDraft = async (draft: NoteCreated, fromCompose = true) => {
    clearErrors();
    open(ROUTES.review, fromCompose, draft);
  };
  const online = useOnline();
  const [allWorkspaces, setAllWorkspaces] = useState(false);
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
    const ok = await addToOutbox(
      {
        clientId,
        body,
        ...(title.trim() ? { title } : {}),
        ...(workspace ? { workspaceId: workspace.id } : {}),
      },
      audio,
    );
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
  const create = useCreateNote();
  const createVoice = useCreateVoiceNote();
  // Separate instances for the outbox resend, so its failures never show on the compose form.
  const resend = useCreateNote();
  const resendVoice = useCreateVoiceNote();
  const sendNote = (body: string, title: string, clientId: string) =>
    create.mutate(
      { body, ...(title.trim() ? { title } : {}), ...meta(clientId) },
      {
        onSuccess: (draft) => onDraft(draft),
        onError: (err) => queueOnNetworkError(err, body, clientId, undefined, title),
      },
    );
  const sendVoice = (audio: Blob, title: string, clientId: string) =>
    createVoice.mutate(
      { audio, meta: { ...(title.trim() ? { title } : {}), ...meta(clientId) } },
      {
        onSuccess: (draft) => onDraft(draft),
        onError: (err) => queueOnNetworkError(err, '', clientId, audio, title),
      },
    );

  /** Send one queued note with its own `clientId`; it leaves the outbox only after success. */
  const sendQueued = async (entry: OutboxEntry, body: string) => {
    const queued = meta(entry.clientId, entry.workspaceId ?? workspace?.id);
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
      draft = await resendVoice.mutateAsync({
        audio,
        meta: { ...(entry.title ? { title: entry.title } : {}), ...queued },
      });
    } else {
      draft = await resend.mutateAsync({
        body,
        ...(entry.title ? { title: entry.title } : {}),
        ...queued,
      });
    }
    await removeFromOutbox(entry.clientId);
    setOutbox(readOutbox());
    await onDraft(draft, false);
  };
  const refreshNotes = useRefreshNotes();
  const submit = useUpdateNote();
  const saveEdit = (id: string, edit: NoteEdit) =>
    submit.mutate(
      { id, edit },
      {
        onSuccess: (saved) => {
          if (workspace && saved.workspaceId !== workspace.id) {
            setSavedIn(workspaces.data?.find((w) => w.id === saved.workspaceId)?.name ?? null);
          }
          setText('');
          setTitle('');
          goBack();
        },
      },
    );
  const changeStatus = useChangeNoteStatus();
  const toggle = useToggleNoteItem();
  const toggleChecklist = useToggleNoteChecklist();
  const pendingId = changeStatus.isPending
    ? changeStatus.variables.id
    : toggle.isPending
      ? toggle.variables.id
      : undefined;
  const clearErrors = () => {
    toggle.reset();
    toggleChecklist.reset();
    submit.reset();
    remove.reset();
    changeStatus.reset();
  };

  const remove = useDeleteNote();
  const removeNote = (id: string) =>
    remove.mutate(id, {
      onSuccess: () => {
        // Leave the editor before the refetch can drop the note and redirect over it.
        goBack();
        setUndoId(id);
      },
    });
  const [snoozeUndo, setSnoozeUndo] = useState<{ id: string; day: string } | null>(null);
  const snooze = useSnoozeNote();
  const snoozeNote = (id: string, day: string | null, fromUndo = false) =>
    snooze.mutate(
      { id, day },
      { onSuccess: () => setSnoozeUndo(day !== null && !fromUndo ? { id, day } : null) },
    );
  useEffect(() => {
    if (snoozeUndo === null) return;
    const timer = setTimeout(() => setSnoozeUndo(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [snoozeUndo]);
  const undo = useRestoreNote();
  const restore = (id: string) =>
    undo.mutate(id, { onSuccess: () => setUndoId(null), onError: () => setUndoId(null) });
  useEffect(() => {
    if (undoId === null) return;
    const timer = setTimeout(() => setUndoId(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoId]);

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

  // Saving a draft leads to the review editor, so fetch it while the user types.
  useEffect(() => {
    if (pathname === ROUTES.compose) void loadEditor();
  }, [pathname]);
  const composeForm = pathname === ROUTES.compose && (
    <ComposeForm
      title={title}
      text={text}
      onTitle={setTitle}
      onText={setText}
      online={online}
      suggesting={create.isPending}
      suggestFailed={create.isError}
      voicePending={createVoice.isPending}
      voiceFailed={createVoice.isError}
      saveFailed={offlineNotice === 'failed'}
      autoRecord={autoRecord}
      onSuggest={() => {
        if (online) sendNote(text, title, crypto.randomUUID());
        else void saveOffline(text, undefined, undefined, title);
      }}
      onVoice={(audio) =>
        online
          ? sendVoice(audio, title, crypto.randomUUID())
          : void saveOffline('', audio, undefined, title)
      }
      onCancel={goBack}
    />
  );
  const pickPlaceholder = (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
      <p className="font-medium">{t('notes.pick')}</p>
      <button type="button" onClick={() => open(ROUTES.compose)} className="btn btn-primary">
        <Icon name="plus" size={18} />
        {t('notes.add')}
      </button>
    </div>
  );

  const [filtersOpen, setFiltersOpen] = useState(false);
  const today = localToday();
  const sort = settings.data?.noteSort ?? DEFAULT_NOTE_SORT;
  const acrossWorkspaces = allWorkspaces && (workspaces.data?.length ?? 0) > 1;
  const workspaceId = workspace?.id;
  const noteRows = notes.data;
  const inWorkspace = useMemo(() => {
    const all = noteRows ?? [];
    return workspaceId && !acrossWorkspaces
      ? all.filter((n) => n.workspaceId === workspaceId)
      : all;
  }, [noteRows, workspaceId, acrossWorkspaces]);
  const deferredFilter = useMemo(() => ({ ...filter, text: deferredText }), [filter, deferredText]);
  const visible = useMemo(
    () =>
      todayMode ? [] : sortNotes(filterNotes(inWorkspace, deferredFilter, today), sort, today),
    [todayMode, inWorkspace, deferredFilter, sort, today],
  );
  const groups = useMemo(
    () => (todayMode ? todayGroups(inWorkspace, today, sort) : null),
    [todayMode, inWorkspace, today, sort],
  );
  const workspaceNames = useMemo(
    () =>
      acrossWorkspaces ? new Map((workspaces.data ?? []).map((w) => [w.id, w.name])) : undefined,
    [acrossWorkspaces, workspaces.data],
  );
  // Ranking and search only see notes once a workspace resolves (or across all workspaces),
  // matching the pre-memo `rankingNotes` behaviour.
  const rankingNotes = useMemo(
    () => (workspaceId || acrossWorkspaces ? inWorkspace : []),
    [workspaceId, acrossWorkspaces, inWorkspace],
  );
  // Stable card callbacks: they read the latest handlers through a ref, so a toast or any
  // other screen state change doesn't redraw the memoized cards.
  const latest = useRef({ clearErrors, open, changeStatus, snoozeNote, toggle });
  useEffect(() => {
    latest.current = { clearErrors, open, changeStatus, snoozeNote, toggle };
  });
  const onOpenNote = useCallback((note: Note) => {
    latest.current.clearErrors();
    latest.current.open(notePath(note.id));
  }, []);
  const onStatusNote = useCallback((note: Note, status: NoteStatus | null) => {
    latest.current.changeStatus.mutate({ id: note.id, status });
  }, []);
  const onSnoozeNote = useCallback((note: Note, day: string | null) => {
    latest.current.snoozeNote(note.id, day);
  }, []);
  const onToggleNoteItem = useCallback((note: Note, index: number) => {
    latest.current.toggle.mutate({ id: note.id, body: toggleItem(note.body, index) });
  }, []);
  const hiddenStatuses =
    settings.data?.noteForm.status.hiddenValues ?? DEFAULT_NOTE_FORM.status.hiddenValues;
  const rankCats = taxonomy.data?.categories;
  const ranked = useMemo(
    () => rankCategories(rankingNotes, rankCats ?? []),
    [rankingNotes, rankCats],
  );

  useNoteShortcuts({
    onNew: () => {
      if (pathname !== ROUTES.compose) open(ROUTES.compose);
    },
  });
  // Esc closes the open note on desktop; open sheets handle their own Esc.
  useEscape((e) => {
    if (detailOpen && shouldCloseOnEscape(e)) goBack();
  });

  if (!notes.data || !taxonomy.data) {
    if (notes.isError || taxonomy.isError || !online) {
      return (
        <Panes
          detail={composeForm}
          list={
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
              <button
                type="button"
                onClick={() => open(ROUTES.compose)}
                className="btn btn-primary"
              >
                <Icon name="plus" size={18} />
                {t('notes.add')}
              </button>
              {waiting}
              <div className="toast-stack">{offlineToast}</div>
            </section>
          }
        />
      );
    }
    return composeForm ? (
      <Panes list={null} detail={composeForm} />
    ) : (
      <Loading label={t('status.checking')} />
    );
  }

  let editor: ReactNode = null;
  if (viewId !== undefined) {
    const viewed = notes.data.find((n) => n.id === viewId);
    // A missing note is a redirect guard: skip the list so it never flashes.
    if (!viewed) return <Navigate to={ROUTES.notes} replace />;
    editor = (
      <NoteView
        key={viewed.id}
        note={viewed}
        taxonomy={taxonomy.data}
        onBack={goBack}
        onEdit={() => open(editPath(viewed.id))}
        onToggleItem={(note, index) =>
          toggle.mutate({ id: note.id, body: toggleItem(note.body, index) })
        }
        togglePending={toggle.isPending}
        onToggleChecklist={(note, itemId) =>
          toggleChecklist.mutate({
            id: note.id,
            checklist: note.checklist.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
          })
        }
        checklistDisabled={!online}
        checklistError={toggleChecklist.isError}
        workspaceName={workspaces.data?.find((w) => w.id === viewed.workspaceId)?.name}
      />
    );
  } else if (pathname === ROUTES.review || editId !== undefined) {
    // History state survives a reload, so it is untrusted like any other input.
    const parsed = pathname === ROUTES.review ? NoteCreated.safeParse(state) : undefined;
    const edited = notes.data.find((n) => n.id === editId);
    const note = parsed?.success ? parsed.data.note : edited;
    if ((parsed && !parsed.success) || !note) {
      // A bad or missing note is a redirect guard, not a mode: skip the list so it never flashes.
      return <Navigate to={ROUTES.notes} replace />;
    } else {
      editor = (
        <Suspense fallback={<Loading label={t('notes.loading')} />}>
          <NoteEditor
            key={note.id}
            note={note}
            suggestion={parsed?.success ? parsed.data.suggestion : suggestionOf(note)}
            taxonomy={taxonomy.data}
            busy={submit.isPending}
            failed={submit.isError || remove.isError}
            onSubmit={(edit) => saveEdit(note.id, edit)}
            onCancel={goBack}
            canReanalyze
            onDelete={() => removeNote(note.id)}
            today={localToday()}
            attachable
            workspaces={workspaces.data}
          />
        </Suspense>
      );
    }
  }

  const chatPanel = chatOpen && (
    <Suspense fallback={<Loading label={t('chat.loading')} />}>
      <ChatPanel
        notes={notes.data}
        onOpenNote={(note) => {
          open(notePath(note.id), true);
        }}
        onClose={goBack}
        onApplied={() => {
          void refreshNotes();
        }}
      />
    </Suspense>
  );
  const showAllWorkspaces = (workspaces.data?.length ?? 0) > 1;
  const shownCount = groups ? todayCount(groups) : visible.length;
  const showContinue =
    !todayMode &&
    filter.text === '' &&
    sameFilter(filter, { ...EMPTY_FILTER, ...workspace?.defaultFilter });
  const locale = i18n.language === 'en' ? ('en' as const) : ('he' as const);
  return (
    <Panes
      placeholder={pickPlaceholder}
      detail={composeForm || editor || chatPanel}
      list={
        <section className="flex flex-col gap-5">
          {online && !outboxDismissed && outbox.length > 0 && (
            <Suspense fallback={null}>
              <OutboxDialog
                entries={outbox}
                taxonomy={taxonomy.data}
                onSend={sendQueued}
                onClose={() => setOutboxDismissed(true)}
              />
            </Suspense>
          )}
          {importing && (
            <Suspense fallback={<Loading label={t('import.loading')} />}>
              <ImportDialog
                taxonomy={taxonomy.data}
                workspaces={workspaces.data ?? []}
                currentWorkspaceId={workspace?.id}
                today={today}
                locale={locale}
                onClose={goBack}
                onImported={(result) => {
                  goBack();
                  setImported(result);
                  void refreshNotes();
                }}
              />
            </Suspense>
          )}
          <div ref={titleSentinel} aria-hidden="true" className="-mb-5 h-px lg:hidden" />
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <h2 className="text-[1.75rem] leading-tight font-bold tracking-tight">
                {todayMode ? t('today.title') : (workspace?.name ?? t('notes.title'))}
              </h2>
              <p className="text-sm text-muted tabular-nums">
                {t('notes.count', { count: shownCount })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => open(ROUTES.chat)}
                onPointerEnter={() => void loadChat()}
                onFocus={() => void loadChat()}
                className="btn min-h-11"
              >
                <Icon name="spark" size={16} className="text-accent" />
                {t('chat.open')}
              </button>
              <button
                type="button"
                onClick={() => open(ROUTES.compose, false, { record: true })}
                className="btn max-lg:hidden"
              >
                <Icon name="mic" size={16} />
                {t('voice.record')}
              </button>
              <div className="max-lg:fixed max-lg:end-4 max-lg:bottom-[calc(var(--tab-h)+1rem+env(safe-area-inset-bottom))] max-lg:z-20 max-lg:flex max-lg:flex-row-reverse max-lg:items-center max-lg:gap-1.5 lg:contents">
                <button
                  type="button"
                  onClick={() => open(ROUTES.compose)}
                  className="btn btn-primary max-lg:h-14 max-lg:rounded-full max-lg:px-5 max-lg:text-base max-lg:shadow-[0_10px_28px_-8px_color-mix(in_oklab,var(--accent)_55%,transparent)] lg:hidden"
                >
                  <Icon name="plus" size={22} />
                  {t('notes.add')}
                </button>
                {quickActions.map((a) => {
                  const { icon, label } = quickMeta[a];
                  const iconOnly = quickActions.length > 1;
                  return (
                    <button
                      key={a}
                      type="button"
                      data-quick-action={a}
                      aria-label={iconOnly ? label : undefined}
                      onClick={quickHandlers[a]}
                      className={`btn h-12 rounded-full lg:hidden ${iconOnly ? 'size-12 p-0' : 'px-5'}`}
                    >
                      <Icon name={icon} size={22} />
                      {!iconOnly && label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {!todayMode && (
            <div className="max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:-mx-4 max-lg:bg-bg/90 max-lg:px-4 max-lg:pb-2 max-lg:backdrop-blur-md">
              <div
                aria-hidden="true"
                data-collapsed={titleCollapsed ? '' : undefined}
                className="grid grid-rows-[0fr] overflow-hidden transition-[grid-template-rows] duration-150 data-[collapsed]:grid-rows-[1fr] lg:hidden"
              >
                <p className="min-h-0 truncate pt-[env(safe-area-inset-top)] text-center text-base leading-10 font-semibold">
                  {workspace?.name ?? t('notes.title')}
                </p>
              </div>
              <NoteFilters
                filter={filter}
                onChange={setFilter}
                taxonomy={taxonomy.data}
                allWorkspaces={acrossWorkspaces}
                sheetOpen={filtersOpen}
                onSheetOpenChange={setFiltersOpen}
                notes={rankingNotes}
                ranked={ranked}
                onOpenNote={(id) => open(notePath(id))}
                onSmartSearch={smartSearch}
                smartPending={smartPending}
                understood={understood === filter}
                onAllWorkspaces={setAllWorkspaces}
                showAllWorkspaces={showAllWorkspaces}
                savedDefault={workspace?.defaultFilter ?? null}
                {...(workspace && {
                  onSaveDefault: () => {
                    const { text: _text, ...defaultFilter } = filter;
                    editWorkspace.mutate({ id: workspace.id, patch: { defaultFilter } });
                  },
                })}
                sort={
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <span className="shrink-0">{t('notes.sort.label')}</span>
                    <select
                      value={sort}
                      onChange={(e) => {
                        const next = NoteSort.safeParse(e.target.value);
                        if (next.success) saveSort.mutate({ noteSort: next.data });
                      }}
                      className="field min-h-11 w-auto py-1 text-sm text-fg"
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
            </div>
          )}
          <p role="status" className="sr-only">
            {todayMode
              ? ''
              : understood === filter
                ? visible.length === 0
                  ? t('filters.foundNone')
                  : t('filters.found', { count: visible.length })
                : ''}
          </p>
          {smartNotice !== null && smartNotice.text === filter.text && (
            <p role="status" className="notice notice-info">
              {smartNotice.kind === 'offline'
                ? t('filters.smartOffline')
                : t('filters.smartFailed')}
            </p>
          )}
          {!todayMode && (
            <CategoryStrip
              ranked={ranked}
              filter={filter}
              onChange={setFilter}
              onOpenAll={() => setFiltersOpen(true)}
            />
          )}
          {saveSort.isError && (
            <p role="alert" className="notice notice-danger">
              {t('notes.error')}
            </p>
          )}
          {editWorkspace.isError && (
            <p role="alert" className="notice notice-danger">
              {t('notes.error')}
            </p>
          )}
          {waiting}
          {showContinue && (
            <ContinueRow
              notes={inWorkspace}
              taxonomy={taxonomy.data}
              today={today}
              onOpen={(note) => {
                clearErrors();
                open(notePath(note.id));
              }}
            />
          )}
          <div className="max-sm:pb-[calc(7rem+env(safe-area-inset-bottom))]">
            {groups ? (
              <TodayList
                groups={groups}
                lang={locale}
                onAllNotes={() => void navigate({ pathname: ROUTES.notes })}
                workspaceNames={workspaceNames}
                taxonomy={taxonomy.data}
                today={today}
                selectedId={openId}
                onOpen={onOpenNote}
                onStatus={onStatusNote}
                onSnooze={onSnoozeNote}
                onToggleItem={onToggleNoteItem}
                hiddenStatuses={hiddenStatuses}
                statusPendingId={pendingId}
              />
            ) : (
              <NoteList
                notes={visible}
                filtered={inWorkspace.length > 0}
                workspaceNames={workspaceNames}
                taxonomy={taxonomy.data}
                today={today}
                selectedId={openId}
                onOpen={onOpenNote}
                onStatus={onStatusNote}
                onSnooze={onSnoozeNote}
                onToggleItem={onToggleNoteItem}
                hiddenStatuses={hiddenStatuses}
                statusPendingId={pendingId}
                onAdd={() => open(ROUTES.compose)}
              />
            )}
          </div>
          {(changeStatus.isError || toggle.isError || snooze.isError) && (
            <p role="alert" className="notice notice-danger">
              {t('notes.error')}
            </p>
          )}
          {undo.isError && (
            <p role="alert" className="notice notice-danger">
              {t('notes.error')}
            </p>
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
            {savedIn !== null && (
              <Toast
                onClose={() => setSavedIn(null)}
                actions={
                  <button type="button" onClick={() => setSavedIn(null)} className="btn btn-sm">
                    {t('import.dismiss')}
                  </button>
                }
              >
                {t('notes.savedIn', { name: savedIn })}
              </Toast>
            )}
            {snoozeUndo !== null && (
              <Toast
                actions={
                  <button
                    type="button"
                    onClick={() => snoozeNote(snoozeUndo.id, null, true)}
                    className="btn btn-sm"
                  >
                    {t('notes.undo')}
                  </button>
                }
              >
                {t('snooze.toast', { date: formatDate(snoozeUndo.day, i18n.language) })}
              </Toast>
            )}
            {undoId !== null && (
              <Toast
                actions={
                  <button type="button" onClick={() => restore(undoId)} className="btn btn-sm">
                    {t('notes.undo')}
                  </button>
                }
              >
                {t('notes.deleted')}
              </Toast>
            )}
          </div>
        </section>
      }
    />
  );
}
