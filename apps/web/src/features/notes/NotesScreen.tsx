import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_NOTE_SORT,
  EMPTY_FILTER,
  NoteSort,
  filterNotes,
  sortNotes,
  type NoteCreated,
  type NoteFilter,
} from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { NoteEditor } from './NoteEditor';
import { NoteFilters } from './NoteFilters';
import { NoteList } from './NoteList';

type Mode = { kind: 'list' } | { kind: 'compose' } | { kind: 'review'; draft: NoteCreated };

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
  const [filter, setFilter] = useState<NoteFilter>(EMPTY_FILTER);
  const saveSort = useMutation({
    mutationFn: api.saveSettings,
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  const create = useMutation({
    mutationFn: (body: string) =>
      api.createNote({
        body,
        clientId: crypto.randomUUID(),
        today: localToday(),
        locale: i18n.language === 'en' ? 'en' : 'he',
      }),
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
      setMode({ kind: 'review', draft });
    },
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

  if (!notes.data || !taxonomy.data) {
    return notes.isError || taxonomy.isError ? (
      <p role="alert" className="text-danger">
        {t('notes.error')}
      </p>
    ) : (
      <p className="text-muted">{t('status.checking')}</p>
    );
  }

  if (mode.kind === 'review') {
    return (
      <NoteEditor
        note={mode.draft.note}
        suggestion={mode.draft.suggestion}
        taxonomy={taxonomy.data}
        busy={submit.isPending}
        failed={submit.isError}
        onSubmit={(edit) => submit.mutate({ id: mode.draft.note.id, edit })}
        onCancel={() => setMode({ kind: 'list' })}
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
      </form>
    );
  }

  const today = localToday();
  const sort = settings.data?.noteSort ?? DEFAULT_NOTE_SORT;
  const visible = sortNotes(filterNotes(notes.data, filter, today), sort, today);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('notes.title')}</h2>
        <button
          type="button"
          onClick={() => setMode({ kind: 'compose' })}
          className="rounded-md bg-fg px-4 py-2 text-bg"
        >
          {t('notes.add')}
        </button>
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
      <NoteList notes={visible} taxonomy={taxonomy.data} today={today} />
    </section>
  );
}
