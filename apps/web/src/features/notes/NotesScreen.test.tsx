import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_NOTE_FORM, EMPTY_SUGGESTION, type Note } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { readOutbox } from '../offline/outbox';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { NotesScreen } from './NotesScreen';

beforeEach(async () => {
  await i18n.changeLanguage('en');
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
});
afterEach(() => {
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
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds,
  hasAudio: false,
  attachments: [],
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

  it('shows the editor on /notes/:id', async () => {
    setup(`/notes/${note(1, '', []).id}`);
    await screen.findByDisplayValue('first note');
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
  const setup = (workspaceList: { id: string; name: string; isDefault: boolean }[]) => {
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
          <NotesScreen workspace={{ id: W1, name: 'Home', isDefault: true }} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const home = { id: W1, name: 'Home', isDefault: true };
  const two = [home, { id: W2, name: 'Garden', isDefault: false }];

  it('finds a note from another workspace with the toggle on, and names its workspace', async () => {
    setup(two);
    await screen.findByText('home note');
    expect(screen.queryByText('garden note')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'All workspaces' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'garden' } });
    await screen.findByText('garden note');
    expect(screen.getByText('Garden')).toBeTruthy();
    expect(screen.queryByText('home note')).toBeNull();
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
