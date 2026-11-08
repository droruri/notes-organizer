import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  DEFAULT_NOTE_FORM,
  EMPTY_FILTER,
  EMPTY_SUGGESTION,
  type Note,
  type SavedFilter,
  type Taxonomy,
} from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../../lib/api';

vi.mock('../../lib/noteStore', async () => {
  const { api } = await import('../../lib/api');
  return { syncNotes: () => api.notes() };
});
import { i18n } from '../../lib/i18n';
import { readOutbox } from '../offline/outbox';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { NotesScreen } from './NotesScreen';
import { parseRecent, recordOpen } from './recent';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
});
afterEach(() => {
  localStorage.clear();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const C = '00000000-0000-4000-8000-000000000001';
const T1 = '00000000-0000-4000-8000-0000000000a1';
const note = (n: number, body: string, tagIds: string[]): Note => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  clientId: `00000000-0000-4000-8000-10000000000${n}`,
  title: null,
  body,
  status: 'todo',
  workspaceId: '00000000-0000-4000-8000-0000000000f1',
  importance: null,
  urgency: null,
  dueDate: null,
  snoozedUntil: null,
  remindAt: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds,
  hasAudio: false,
  attachments: [],
  checklist: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('NotesScreen offline with no loaded data', () => {
  it('shows the Add button and queues a submitted note in the outbox', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    screen.getByText(/you can still add a note/i);
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'buy milk' } });
    const form = screen.getByLabelText('Text').closest('form');
    if (!form) throw new Error('compose form not found');
    fireEvent.submit(form);
    await waitFor(() => expect(readOutbox().map((e) => e.body)).toEqual(['buy milk']));
  });
});

describe('NotesScreen opened from a tag', () => {
  it('shows only the notes carrying the tag it was opened with', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([
      note(1, 'tagged note', [T1]),
      note(2, 'other note', []),
    ]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({
      categories: [
        {
          id: C,
          name: 'work',
          deleted: false,
          importance: null,
          color: 'slate' as const,
          pinned: false,
          tags: [{ id: T1, categoryId: C, name: 'urgent', deleted: false }],
        },
      ],
    });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen initialTagId={T1} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('tagged note');
    expect(screen.queryByText('other note')).toBeNull();
  });

  it('renders restored notes while the sync request is still pending', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockReturnValue(new Promise(() => {}));
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['notes'], [note(1, 'restored note', [])], { updatedAt: 0 });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('restored note');
    expect(api.notes).toHaveBeenCalled();
  });
});

describe('NotesScreen modes from the URL', () => {
  const setup = (entry: string | { pathname: string; state: unknown }) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([note(1, 'first note', [])]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <Where />
          <Routes>
            <Route path="/" element={<NotesScreen />}>
              <Route path="new" element={null} />
              <Route path="review" element={null} />
              <Route path="chat" element={null} />
              <Route path="import" element={null} />
              <Route path="notes/:id" element={null} />
              <Route path="notes/:id/edit" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('shows compose on /new', async () => {
    setup('/new');
    await screen.findByRole('button', { name: 'Suggest' });
  });

  it('compose fields are rtl while empty and auto once they have text', async () => {
    setup('/new');
    const title = await screen.findByRole('textbox', { name: i18n.t('notes.noteTitle') });
    const body = screen.getByRole('textbox', { name: i18n.t('notes.body') });
    expect(title.getAttribute('dir')).toBe('rtl');
    expect(body.getAttribute('dir')).toBe('rtl');
    fireEvent.change(body, { target: { value: 'hello' } });
    expect(body.getAttribute('dir')).toBe('auto');
    fireEvent.change(body, { target: { value: '   ' } });
    expect(body.getAttribute('dir')).toBe('rtl');
  });

  it('compose and the editor have a nav bar with back and the primary action', async () => {
    setup('/new');
    await screen.findByRole('button', { name: 'Suggest' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('first note');
    cleanup();
    setup(`/notes/${note(1, '', []).id}/edit`);
    await screen.findByDisplayValue('first note');
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('pushes compose and an opened note with a view transition on mobile', async () => {
    const start = vi.fn((cb: () => Promise<void>) => void cb());
    Object.assign(document, { startViewTransition: start });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
    try {
      setup('/');
      fireEvent.click(await screen.findByText('first note'));
      await screen.findByRole('button', { name: 'Edit' });
      expect(start).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('keeps the search field visible and moves sort into the filters sheet', async () => {
    setup('/');
    await screen.findByText('first note');
    expect(screen.getByRole('combobox', { name: 'Search notes' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Sort' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeTruthy();
  });

  it('shows the read-only view on /notes/:id and the editor on /notes/:id/edit', async () => {
    const id = note(1, '', []).id;
    setup(`/notes/${id}`);
    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.queryByDisplayValue('first note')).toBeNull();
    cleanup();
    setup(`/notes/${id}/edit`);
    await screen.findByDisplayValue('first note');
  });

  it('click a note opens the view, Edit opens the editor, Back returns to the view', async () => {
    setup('/');
    fireEvent.click(await screen.findByText('first note'));
    expect(screen.getByTestId('where').textContent).toBe(`/notes/${note(1, '', []).id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await screen.findByDisplayValue('first note');
    expect(screen.getByTestId('where').textContent).toBe(`/notes/${note(1, '', []).id}/edit`);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('button', { name: 'Edit' });
    expect(screen.getByTestId('where').textContent).toBe(`/notes/${note(1, '', []).id}`);
  });

  it('shows the review of the draft in the history state', async () => {
    const draft = {
      note: note(1, 'drafted', []),
      suggestion: EMPTY_SUGGESTION,
    };
    setup({ pathname: '/review', state: draft });
    await screen.findByDisplayValue('drafted');
  });

  it('goes to the list on a bad /review state', async () => {
    setup({ pathname: '/review', state: { junk: true } });
    await screen.findByText('first note');
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('goes to the list for an unknown note id', async () => {
    setup('/notes/00000000-0000-4000-8000-0000000000ff');
    await screen.findByText('first note');
    expect(screen.getByTestId('where').textContent).toBe('/');
  });

  it('opens chat at /chat and closes it back to the list', async () => {
    setup('/');
    await screen.findByText('first note');
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    const drawer = await screen.findByRole('dialog', { name: 'Ask about your notes' });
    expect(screen.getByTestId('where').textContent).toBe('/chat');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.transitionEnd(drawer);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the import dialog on /import', async () => {
    setup('/import');
    await screen.findByRole('dialog', { name: /import/i });
  });
});

describe('NotesScreen Today view', () => {
  const setup = (entry: string) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const due: Note = { ...note(1, 'overdue note', []), dueDate: '2020-01-01' };
    vi.spyOn(api, 'notes').mockResolvedValue([due, note(2, 'plain note', [])]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({
      categories: [
        {
          id: C,
          name: 'work',
          deleted: false,
          importance: null,
          color: 'slate',
          pinned: false,
          tags: [],
        },
      ],
    });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // oxlint-disable-next-line react/no-multi-comp -- tiny test probe
    const Where = () => (
      <p data-testid="where">{`${useLocation().pathname}${useLocation().search}`}</p>
    );
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <Where />
          <Routes>
            <Route path="/" element={<NotesScreen />}>
              <Route path="notes/:id" element={null} />
              <Route path="notes/:id/edit" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('hides the search, filters and sort and lists only actionable notes', async () => {
    setup('/?view=today');
    await screen.findByText('overdue note');
    expect(screen.queryByText('plain note')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^filter/i })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Categories' })).toBeNull();
    expect(screen.queryByLabelText('Sort')).toBeNull();
    screen.getByRole('heading', { name: 'Today' });
  });

  it('shows the normal list for an unknown view value', async () => {
    setup('/?view=bogus');
    await screen.findByText('plain note');
    expect(screen.getAllByText('overdue note').length).toBeGreaterThan(0);
    // Control assertions: the controls the Today test expects to hide are present here.
    screen.getByRole('button', { name: /^filter/i });
    screen.getByRole('list', { name: 'Categories' });
  });

  it('keeps view=today in the URL when a card is opened', async () => {
    setup('/?view=today');
    fireEvent.click(await screen.findByText('overdue note'));
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toMatch(/^\/notes\/.+\?view=today$/),
    );
  });
});

describe('NotesScreen status from the list', () => {
  it('saves the next status on tap, keeps the list open and shows the saved note', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const done: Note = { ...note(1, 'first note', []), status: 'done' };
    // the mock returns `done` regardless; the card then shows Done
    let saved = false;
    vi.spyOn(api, 'notes').mockImplementation(async () => [
      saved ? done : note(1, 'first note', []),
    ]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const update = vi.spyOn(api, 'updateNote').mockImplementation(async () => {
      saved = true;
      return done;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('first note');
    fireEvent.click(screen.getByRole('button', { name: 'To do — move to In progress' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', {
        status: 'in_progress',
      }),
    );
    await screen.findByRole('button', { name: 'Done — move to To do' });
    screen.getByText('first note');
  });
});

describe('NotesScreen across workspaces', () => {
  const W1 = '00000000-0000-4000-8000-0000000000f1';
  const W2 = '00000000-0000-4000-8000-0000000000f2';
  const setup = (
    workspaceList: { id: string; name: string; isDefault: boolean; defaultFilter: null }[],
  ) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([
      note(1, 'home note', []),
      { ...note(2, 'garden note', []), workspaceId: W2 },
    ]);
    vi.spyOn(api, 'workspaces').mockResolvedValue(workspaceList);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen workspace={{ id: W1, name: 'Home', isDefault: true, defaultFilter: null }} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const home = { id: W1, name: 'Home', isDefault: true, defaultFilter: null };
  const two = [home, { id: W2, name: 'Garden', isDefault: false, defaultFilter: null }];

  it('finds a note from another workspace with the toggle on, and names its workspace', async () => {
    setup(two);
    await screen.findByText('home note');
    expect(screen.queryByText('garden note')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'All workspaces' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes' }), {
      target: { value: 'garden' },
    });
    await screen.findByText('garden note');
    expect(screen.getByText('Garden')).toBeTruthy();
    expect(screen.queryByText('home note')).toBeNull();
  });

  it('continue row shows only this workspace recents and hides with search text', async () => {
    recordOpen(note(2, '', []).id, 2);
    recordOpen(note(1, '', []).id, 1);
    setup(two);
    const row = await screen.findByRole('region', { name: 'Continue' });
    expect(within(row).getByText('home note')).toBeTruthy();
    expect(within(row).queryByText('garden note')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes' }), {
      target: { value: 'home' },
    });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Continue' })).toBeNull());
  });

  it('has no toggle with a single workspace', async () => {
    setup([home]);
    await screen.findByText('home note');
    expect(screen.queryByRole('button', { name: 'All workspaces' })).toBeNull();
  });
});

describe('NotesScreen mobile quick actions', () => {
  const renderWith = async (quickActions: ('workspaces' | 'record' | 'import')[]) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions,
    });
    const onWorkspaces = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // oxlint-disable-next-line react/no-multi-comp -- tiny test probe
    const Where = () => {
      const loc = useLocation();
      return (
        <p data-testid="where" data-record={String(JSON.stringify(loc.state))}>
          {loc.pathname}
        </p>
      );
    };
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen onWorkspaces={onWorkspaces} />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.settings).toHaveBeenCalled());
    return onWorkspaces;
  };
  const quick = (a: string) => document.querySelector<HTMLElement>(`[data-quick-action="${a}"]`);
  const need = (a: string): HTMLElement => {
    const el = quick(a);
    if (!el) throw new Error(`missing quick action ${a}`);
    return el;
  };

  it('keeps the label with one extra', async () => {
    await renderWith(['record']);
    await waitFor(() => expect(quick('record')?.textContent).toBe('Record'));
    expect(quick('record')?.getAttribute('aria-label')).toBeNull();
  });

  it('shows only icons, with accessible names, with three extras', async () => {
    await renderWith(['import', 'workspaces', 'record']);
    await waitFor(() => expect(quick('import')).not.toBeNull());
    for (const a of ['workspaces', 'record', 'import']) expect(quick(a)?.textContent).toBe('');
    expect(quick('workspaces')?.getAttribute('aria-label')).toBe('Workspaces');
    expect(quick('record')?.getAttribute('aria-label')).toBe('Record');
    expect(quick('import')?.getAttribute('aria-label')).toBe('Import notes');
    expect(screen.getAllByRole('button', { name: 'New note' }).length).toBeGreaterThan(0);
  });

  it('shows no extras when none are chosen', async () => {
    await renderWith([]);
    await waitFor(() => expect(api.settings).toHaveBeenCalled());
    await screen.findAllByRole('button', { name: 'New note' });
    expect(document.querySelectorAll('[data-quick-action]')).toHaveLength(0);
  });

  it('runs each action', async () => {
    const onWorkspaces = await renderWith(['workspaces', 'record', 'import']);
    await waitFor(() => expect(quick('workspaces')).not.toBeNull());
    fireEvent.click(need('workspaces'));
    expect(onWorkspaces).toHaveBeenCalled();
    fireEvent.click(need('import'));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/import'));
    fireEvent.click(need('record'));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/new'));
    expect(screen.getByTestId('where').getAttribute('data-record')).toBe('{"record":true}');
  });

  it('hides the Workspaces action when no handler is wired', async () => {
    vi.spyOn(api, 'notes').mockResolvedValue([]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['workspaces'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findAllByRole('button', { name: 'New note' });
    await waitFor(() => expect(api.settings).toHaveBeenCalled());
    expect(quick('workspaces')).toBeNull();
  });
});

describe('NotesScreen default filter', () => {
  const W1 = '00000000-0000-4000-8000-0000000000f1';
  const W2 = '00000000-0000-4000-8000-0000000000f2';
  const TAG = '00000000-0000-4000-8000-0000000000b1';
  const { text: _t, ...base } = EMPTY_FILTER;
  const saved = { ...base, statuses: ['done' as const], tagIds: [TAG] };
  const ws = (id: string, defaultFilter: SavedFilter | null) => ({
    id,
    name: id === W1 ? 'Home' : 'Garden',
    isDefault: id === W1,
    defaultFilter,
  });
  const setup = (
    workspace: ReturnType<typeof ws>,
    list: ReturnType<typeof ws>[],
    initialTagId: string | null = null,
  ) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([
      { ...note(1, 'done tagged', [TAG]), status: 'done' },
      note(2, 'todo plain', []),
    ]);
    vi.spyOn(api, 'workspaces').mockResolvedValue(list);
    const taxonomy: Taxonomy = {
      categories: [
        {
          id: C,
          name: 'Cat',
          deleted: false,
          importance: null,
          color: 'slate',
          pinned: false,
          tags: [{ id: TAG, categoryId: C, name: 'Tg', deleted: false }],
        },
      ],
    };
    vi.spyOn(api, 'taxonomy').mockResolvedValue(taxonomy);
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (w: typeof workspace) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen workspace={w} initialTagId={initialTagId} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const r = render(tree(workspace));
    return { client, rerender: (w: typeof workspace) => r.rerender(tree(w)) };
  };
  const openSheet = async () =>
    fireEvent.click(await screen.findByRole('button', { name: /^Filter/ }));

  it('applies the workspace default and filters the list', async () => {
    setup(ws(W1, saved), [ws(W1, saved)]);
    await screen.findByText('done tagged');
    expect(screen.queryByText('todo plain')).toBeNull();
    await openSheet();
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Tg' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('applies the next workspace default when switching', async () => {
    const { rerender } = setup(ws(W1, saved), [ws(W1, saved), ws(W2, null)]);
    await screen.findByText('done tagged');
    await openSheet();
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe('true');
    rerender(ws(W2, null));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe(
        'false',
      ),
    );
  });

  it('initialTagId overrides the default', async () => {
    // Default is status "todo" only, so "done tagged" shows only if the tag override wins.
    setup(ws(W1, { ...saved, tagIds: [], statuses: ['todo' as const] }), [ws(W1, saved)], TAG);
    await screen.findByText('done tagged');
    expect(screen.queryByText('todo plain')).toBeNull();
  });

  it('saves the filter without text and updates the cache', async () => {
    const w = ws(W1, null);
    const edit = vi.spyOn(api, 'editWorkspace');
    const { client } = setup(w, [w]);
    edit.mockResolvedValue(ws(W1, saved));
    await openSheet();
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tg' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search notes' }), {
      target: { value: 'zzz' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as default' }));
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(edit).toHaveBeenCalledWith(W1, { defaultFilter: saved });
    await waitFor(() =>
      expect(
        client.getQueryData<{ defaultFilter: unknown }[]>(['workspaces'])?.[0]?.defaultFilter,
      ).toEqual(saved),
    );
  });

  it('shows a disabled "✓ Default" when the filter matches', async () => {
    setup(ws(W1, saved), [ws(W1, saved)]);
    await openSheet();
    const b = await screen.findByRole('button', { name: '✓ Default' });
    expect(b).toHaveProperty('disabled', true);
  });

  it('disables the save button while offline', async () => {
    setup(ws(W1, null), [ws(W1, null)]);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    await openSheet();
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    const b = await screen.findByRole('button', { name: 'Save as default' });
    expect(b).toHaveProperty('disabled', true);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  });

  it('hides the button with all workspaces on', async () => {
    setup(ws(W1, null), [ws(W1, null), ws(W2, null)]);
    await screen.findByRole('button', { name: 'All workspaces' });
    await openSheet();
    expect(await screen.findByRole('button', { name: /default/i })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'All workspaces' }));
    expect(screen.queryByRole('button', { name: /default/i })).toBeNull();
  });
});

describe('NotesScreen smart search', () => {
  const searchInput = () => {
    const input = screen.getByRole('combobox');
    if (!(input instanceof HTMLInputElement)) throw new Error('search combobox is not an input');
    return input;
  };
  const W = '00000000-0000-4000-8000-0000000000f1';
  const workspace = { id: W, name: 'Home', isDefault: true, defaultFilter: null };
  const setup = () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([
      { ...note(1, 'done thing', []), status: 'done' },
      note(2, 'todo plain', []),
    ]);
    vi.spyOn(api, 'workspaces').mockResolvedValue([workspace]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotesScreen workspace={workspace} initialTagId={null} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const sentence = async (text: string) => {
    const box = await screen.findByRole('combobox');
    fireEvent.change(box, { target: { value: text } });
    fireEvent.keyDown(box, { key: 'Enter' });
    return box;
  };

  it('turns a sentence into chips, labels them, announces the count and keeps focus', async () => {
    setup();
    const spy = vi
      .spyOn(api, 'filterFromText')
      .mockResolvedValue({ filter: { ...EMPTY_FILTER, statuses: ['done'] } });
    const box = await sentence('show me finished things');
    expect(box.getAttribute('enterkeyhint')).toBe('search');
    await waitFor(() => expect(screen.getByText('Understood:')).toBeTruthy());
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ text: 'show me finished things' }));
    expect(searchInput().value).toBe('');
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => s.textContent === 'Found 1 note')).toBe(
        true,
      ),
    );
    // editing the filter drops the label
    fireEvent.click(screen.getByRole('button', { name: /^Clear all/ }));
    await waitFor(() => expect(screen.queryByText('Understood:')).toBeNull());
  });

  it('keeps the text search and shows a notice when the API fails', async () => {
    setup();
    vi.spyOn(api, 'filterFromText').mockRejectedValue(new Error('503'));
    await sentence('show me finished things');
    expect(await screen.findByText(/Smart search is unavailable/)).toBeTruthy();
    expect(searchInput().value).toBe('show me finished things');
    expect(screen.getByRole('combobox').getAttribute('aria-busy')).toBe('false');
  });

  it('does not call the API offline and shows a notice', async () => {
    setup();
    const spy = vi.spyOn(api, 'filterFromText');
    await screen.findByRole('combobox');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    await sentence('show me finished things');
    expect((await screen.findAllByText(/needs a connection/)).length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  });

  it('sets aria-busy while waiting', async () => {
    setup();
    let resolve: (v: { filter: typeof EMPTY_FILTER }) => void = () => undefined;
    vi.spyOn(api, 'filterFromText').mockReturnValue(new Promise((r) => (resolve = r)));
    const box = await sentence('show me finished things');
    await waitFor(() => expect(box.getAttribute('aria-busy')).toBe('true'));
    resolve({ filter: EMPTY_FILTER });
    await waitFor(() => expect(box.getAttribute('aria-busy')).toBe('false'));
  });
});

describe('NotesScreen recent opens', () => {
  it('records a note as opened when its route is shown', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockResolvedValue([note(1, 'opened note', [])]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const id = note(1, '', []).id;
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/notes/${id}`]}>
          <NotesScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(parseRecent(localStorage.getItem('recentNotes'))[0]?.id).toBe(id));
  });
});

describe('NotesScreen checklist toggle', () => {
  const body = '- [ ] milk\n- [ ] Dan';
  function setup(update: typeof api.updateNote) {
    let server = body;
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(api, 'notes').mockImplementation(() => Promise.resolve([note(1, server, [])]));
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    vi.spyOn(api, 'updateNote').mockImplementation(async (id, patch) => {
      const saved = await update(id, patch);
      server = saved.body;
      return saved;
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <NotesScreen />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('saves the toggled body optimistically', async () => {
    setup((id, patch) => Promise.resolve({ ...note(1, patch.body ?? '', []), id }));
    fireEvent.click(await screen.findByRole('button', { name: 'Expand' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'milk' }));
    await waitFor(() => {
      const box = screen.getByRole('checkbox', { name: 'milk' });
      expect(box instanceof HTMLInputElement && box.checked).toBe(true);
    });
    expect(api.updateNote).toHaveBeenCalledWith(note(1, body, []).id, {
      body: '- [x] milk\n- [ ] Dan',
    });
  });

  it('rolls back and shows an error when the save fails', async () => {
    setup(() => Promise.reject(new Error('boom')));
    fireEvent.click(await screen.findByRole('button', { name: 'Expand' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'milk' }));
    await screen.findByRole('alert');
    const box = screen.getByRole('checkbox', { name: 'milk' });
    expect(box instanceof HTMLInputElement && box.checked).toBe(false);
  });
});

describe('NotesScreen checklist in view mode', () => {
  const A = '00000000-0000-4000-8000-0000000000c1';
  const B = '00000000-0000-4000-8000-0000000000c2';
  const items = [
    { id: A, text: 'milk', done: true },
    { id: B, text: 'eggs', done: false },
  ];
  const setup = (online = true) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
    const n = { ...note(1, 'shopping', []), checklist: items };
    vi.spyOn(api, 'notes').mockResolvedValue([n]);
    vi.spyOn(api, 'taxonomy').mockResolvedValue({ categories: [] });
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: ['record'],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/notes/${n.id}`]}>
          <Routes>
            <Route path="/" element={<NotesScreen />}>
              <Route path="notes/:id" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return n;
  };

  it('sends the full updated list and shows the new count before the save returns', async () => {
    const n = setup();
    const saved = { ...n, checklist: items.map((i) => ({ ...i, done: true })) };
    let release: () => void = () => {};
    const update = vi.spyOn(api, 'updateNote').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(saved);
        }),
    );
    await screen.findByText('1/2');
    const box = screen.getAllByRole('checkbox')[1];
    if (!(box instanceof HTMLInputElement)) throw new Error('expected a checkbox');
    fireEvent.click(box);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(n.id, {
        checklist: [
          { id: A, text: 'milk', done: true },
          { id: B, text: 'eggs', done: true },
        ],
      }),
    );
    await screen.findByText('2/2');
    vi.mocked(api.notes).mockResolvedValue([saved]);
    release();
    await screen.findByText('2/2');
  });

  it('unticks an item and sends the full list with it cleared', async () => {
    const n = setup();
    const saved = { ...n, checklist: items.map((i) => ({ ...i, done: false })) };
    const update = vi.spyOn(api, 'updateNote').mockResolvedValue(saved);
    vi.mocked(api.notes).mockResolvedValue([saved]);
    await screen.findByText('1/2');
    const box = screen.getAllByRole('checkbox')[0];
    if (!(box instanceof HTMLInputElement)) throw new Error('expected a checkbox');
    fireEvent.click(box);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(n.id, {
        checklist: [
          { id: A, text: 'milk', done: false },
          { id: B, text: 'eggs', done: false },
        ],
      }),
    );
    await screen.findByText('0/2');
  });

  it('rolls back and shows an error when saving fails', async () => {
    const n = setup();
    let rejectSave: (reason: Error) => void = () => {};
    vi.spyOn(api, 'updateNote').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    await screen.findByText('1/2');
    // Hold the refetch that follows the failed save, so the rolled-back state is observable.
    let releaseRefetch: () => void = () => {};
    vi.mocked(api.notes).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseRefetch = () => resolve([n]);
        }),
    );
    const box = screen.getAllByRole('checkbox')[1];
    if (!(box instanceof HTMLInputElement)) throw new Error('expected a checkbox');
    fireEvent.click(box);
    await screen.findByText('2/2');
    rejectSave(new Error('boom'));
    await screen.findByText('1/2');
    releaseRefetch();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(i18n.t('notes.error'));
  });

  it('disables the checkboxes when offline', async () => {
    setup(false);
    await screen.findByText('1/2');
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box instanceof HTMLInputElement && box.disabled).toBe(true);
    }
  });
});
