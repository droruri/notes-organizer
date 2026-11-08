import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DEFAULT_NOTE_FORM,
  EMPTY_SUGGESTION,
  HideableField,
  type Note,
  type NoteForm,
  type Suggestion,
  type Taxonomy,
} from '@notes/shared';
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { ReactElement } from 'react';
import { api } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { NoteEditor } from './NoteEditor';

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

const ID = '00000000-0000-4000-8000-000000000001';
const note = (title: string | null): Note => ({
  id: ID,
  clientId: ID,
  title,
  body: 'pay rent',
  status: 'draft',
  workspaceId: '00000000-0000-4000-8000-0000000000f1',
  importance: null,
  urgency: null,
  dueDate: null,
  snoozedUntil: null,
  remindAt: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  checklist: [],
  createdAt: '',
  updatedAt: '',
});

function setup(title: string | null, next: Suggestion) {
  let resolve: (s: Suggestion) => void = () => undefined;
  const onReanalyze = () =>
    new Promise<Suggestion>((r) => {
      resolve = r;
    });
  const onSubmit = vi.fn();
  render(
    <NoteEditor
      note={note(title)}
      suggestion={EMPTY_SUGGESTION}
      taxonomy={{ categories: [] }}
      busy={false}
      failed={false}
      onSubmit={onSubmit}
      onCancel={() => undefined}
      onReanalyze={onReanalyze}
    />,
  );
  const input = () => screen.getByLabelText<HTMLInputElement>('Title (optional)');
  const analyze = async (whileRunning?: () => void) => {
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze' }));
    whileRunning?.();
    resolve(next);
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Re-analyze' }).disabled).toBe(
        false,
      ),
    );
  };
  return { input, analyze, onSubmit };
}

describe('NoteEditor header', () => {
  it('puts Cancel next to Save in the header and calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <NoteEditor
        note={note(null)}
        suggestion={EMPTY_SUGGESTION}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={() => undefined}
        onCancel={onCancel}
      />,
    );
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(cancel.parentElement).toBe(save.parentElement);
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('NoteEditor title', () => {
  it('no suggested badge when the suggested title is blank', () => {
    render(
      <NoteEditor
        note={note(null)}
        suggestion={{ ...EMPTY_SUGGESTION, title: '' }}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        onReanalyze={() => new Promise<Suggestion>(() => undefined)}
      />,
    );
    expect(screen.queryByText('Suggested by Claude')).toBeNull();
  });

  it('shows the suggested badge only when the suggestion has content', () => {
    const { unmount } = render(
      <NoteEditor
        note={note(null)}
        suggestion={{ ...EMPTY_SUGGESTION, title: 'AI' }}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        onReanalyze={() => new Promise<Suggestion>(() => undefined)}
      />,
    );
    expect(screen.getByText('Suggested by Claude')).toBeTruthy();
    unmount();
  });

  it('re-analyze keeps a typed title', async () => {
    const { input, analyze } = setup('Mine', { ...EMPTY_SUGGESTION, title: 'AI' });
    await analyze();
    expect(input().value).toBe('Mine');
  });

  it('re-analyze fills an empty title', async () => {
    const { input, analyze } = setup(null, { ...EMPTY_SUGGESTION, title: 'AI' });
    await analyze();
    expect(input().value).toBe('AI');
  });

  it('re-analyze does not overwrite a title typed while it runs', async () => {
    const { input, analyze } = setup(null, { ...EMPTY_SUGGESTION, title: 'AI' });
    await analyze(() => fireEvent.change(input(), { target: { value: 'Typed meanwhile' } }));
    expect(input().value).toBe('Typed meanwhile');
  });

  it('saves a cleared title as null', () => {
    const { input, onSubmit } = setup('Old', EMPTY_SUGGESTION);
    fireEvent.change(input(), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: null }));
  });
});

describe('attachments gate', () => {
  const renderEditor = (attachable: boolean) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NoteEditor
          note={note('Plan')}
          suggestion={EMPTY_SUGGESTION}
          taxonomy={{ categories: [] }}
          busy={false}
          failed={false}
          onSubmit={vi.fn()}
          onCancel={() => undefined}
          onReanalyze={() => new Promise<Suggestion>(() => undefined)}
          attachable={attachable}
        />
      </QueryClientProvider>,
    );

  it('offers Add file when the editor is attachable', () => {
    renderEditor(true);
    expect(screen.getByText('Add file')).toBeTruthy();
  });

  it('hides Add file for import rows and outbox items', () => {
    renderEditor(false);
    expect(screen.queryByText('Add file')).toBeNull();
  });
});

describe('NoteEditor category importance', () => {
  const HI = '11111111-1111-4111-8111-111111111111';
  const LO = '33333333-3333-4333-8333-333333333333';
  const TAG = '22222222-2222-4222-8222-222222222222';
  const taxonomy: Taxonomy = {
    categories: [
      {
        id: HI,
        name: 'Work',
        deleted: false,
        importance: 'important',
        color: 'slate' as const,
        pinned: false,
        tags: [{ id: TAG, categoryId: HI, name: 'Urgent', deleted: false }],
      },
      {
        id: LO,
        name: 'Home',
        deleted: false,
        importance: 'not_important',
        color: 'slate' as const,
        pinned: false,
        tags: [],
      },
    ],
  };
  const open = (suggestion: Suggestion = EMPTY_SUGGESTION) => {
    const onSubmit = vi.fn();
    render(
      <NoteEditor
        note={note(null)}
        suggestion={suggestion}
        taxonomy={taxonomy}
        busy={false}
        failed={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    const select = () => screen.getByLabelText<HTMLSelectElement>(/^Importance/);
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    return { onSubmit, select, submit };
  };

  it('raises when an important category is added and shows the hint', () => {
    const { select } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(select().value).toBe('important');
    expect(screen.getByText('Set by category Work')).toBeTruthy();
  });

  it('raises when an important category is added through the dialog', () => {
    const { select } = open();
    fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
    const dialog = screen.getByRole('dialog', { name: 'Choose categories' });
    fireEvent.click(within(dialog).getByLabelText('Work'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(select().value).toBe('important');
    expect(screen.getByText('Set by category Work')).toBeTruthy();
  });

  it('raises when added through a tag', () => {
    const { select } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Urgent' }));
    expect(select().value).toBe('important');
  });

  it('never lowers when a category is removed or a lower one is added', () => {
    const { select } = open({ ...EMPTY_SUGGESTION, categoryIds: [HI], importance: 'important' });
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(select().value).toBe('important');
  });

  it('submits a manual change made after a raise', () => {
    const { select, onSubmit, submit } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    fireEvent.change(select(), { target: { value: 'not_important' } });
    expect(screen.queryByText('Set by category Work')).toBeNull();
    submit();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ importance: 'not_important' });
  });

  it('leaves stored importance alone when no category is added', () => {
    const { select, onSubmit, submit } = open({
      ...EMPTY_SUGGESTION,
      categoryIds: [HI],
      importance: 'not_important',
    });
    expect(select().value).toBe('not_important');
    submit();
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ importance: 'not_important' });
  });
});

describe('NoteEditor form settings', () => {
  const mount = (hiddenFields: HideableField[]) => {
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'urgency',
      noteForm: { ...DEFAULT_NOTE_FORM, hiddenFields },
      quickActions: ['record'],
    });
    const onSubmit = vi.fn();
    render(
      <NoteEditor
        note={note(null)}
        suggestion={{ ...EMPTY_SUGGESTION, dueDate: '2026-12-01' }}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    return onSubmit;
  };

  it('does not render a hidden field but still submits its value', async () => {
    const onSubmit = mount(['dueDate']);
    await waitFor(() => expect(screen.queryByLabelText('Due date')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2026-12-01' }));
  });

  it('has no settings button any more', async () => {
    mount([]);
    await waitFor(() => expect(screen.getByLabelText('Text')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /settings/i })).toBeNull();
  });
});

describe('NoteEditor choice display', () => {
  const HI = '11111111-1111-4111-8111-111111111111';
  const mount = (noteForm: NoteForm, taxonomy: Taxonomy = { categories: [] }) => {
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'urgency',
      noteForm,
      quickActions: ['record'],
    });
    const onSubmit = vi.fn();
    render(
      <NoteEditor
        note={note(null)}
        suggestion={EMPTY_SUGGESTION}
        taxonomy={taxonomy}
        busy={false}
        failed={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    return onSubmit;
  };

  it('shows dropdowns by default', () => {
    mount(DEFAULT_NOTE_FORM);
    expect(screen.getByLabelText('Importance').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Urgency').tagName).toBe('SELECT');
  });

  it('shows buttons with none + every value and submits the pick', async () => {
    const onSubmit = mount({
      ...DEFAULT_NOTE_FORM,
      urgency: { display: 'buttons', hiddenValues: [] },
    });
    const group = await screen.findByRole('radiogroup', { name: 'Urgency' });
    expect(within(group).getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByLabelText('Importance').tagName).toBe('SELECT');
    fireEvent.click(within(group).getByRole('radio', { name: 'Critical' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ urgency: 'critical' });
  });

  it.each(['dropdown', 'buttons'] as const)(
    'does not offer a hidden value (%s)',
    async (display) => {
      mount({ ...DEFAULT_NOTE_FORM, urgency: { display, hiddenValues: ['medium'] } });
      if (display === 'buttons') {
        const group = await screen.findByRole('radiogroup', { name: 'Urgency' });
        expect(within(group).queryByRole('radio', { name: 'Medium' })).toBeNull();
        expect(within(group).getAllByRole('radio')).toHaveLength(4);
      } else {
        await waitFor(() =>
          expect(within(screen.getByLabelText('Urgency')).queryByText('Medium')).toBeNull(),
        );
      }
    },
  );

  it('still shows and submits a hidden value the note has; it stays offered after a change', async () => {
    vi.spyOn(api, 'settings').mockResolvedValue({
      noteSort: 'urgency',
      noteForm: {
        ...DEFAULT_NOTE_FORM,
        urgency: { display: 'dropdown', hiddenValues: ['medium'] },
      },
      quickActions: ['record'],
    });
    const onSubmit = vi.fn();
    render(
      <NoteEditor
        note={note(null)}
        suggestion={{ ...EMPTY_SUGGESTION, urgency: 'medium' }}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>('Urgency');
    await waitFor(() => expect(select.value).toBe('medium'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ urgency: 'medium' });
    fireEvent.change(select, { target: { value: 'urgent' } });
    expect(within(select).queryByText('Medium')).not.toBeNull();
  });

  it('keeps the importance hint in buttons mode', async () => {
    mount(
      { ...DEFAULT_NOTE_FORM, importance: { display: 'buttons', hiddenValues: [] } },
      {
        categories: [
          {
            id: HI,
            name: 'Work',
            deleted: false,
            importance: 'important',
            color: 'slate' as const,
            pinned: false,
            tags: [],
          },
        ],
      },
    );
    await screen.findByRole('radiogroup', { name: 'Importance' });
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(screen.getByText('Set by category Work')).toBeTruthy();
  });
});

describe('NoteEditor workspace', () => {
  const W1 = '00000000-0000-4000-8000-0000000000f1';
  const W2 = '00000000-0000-4000-8000-0000000000f2';
  const workspaces = [
    { id: W1, name: 'Home', isDefault: true, defaultFilter: null },
    { id: W2, name: 'Work', isDefault: false, defaultFilter: null },
  ];
  const editor = (onSubmit: () => void, ws = workspaces) =>
    render(
      <NoteEditor
        note={note(null)}
        suggestion={{ ...EMPTY_SUGGESTION, workspaceId: W2 }}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
        workspaces={ws}
      />,
    );

  it('shows the suggested workspace and sends the changed id', () => {
    const onSubmit = vi.fn();
    editor(onSubmit);
    const select = screen.getByLabelText<HTMLSelectElement>('Workspace');
    expect(select.value).toBe(W2);
    fireEvent.change(select, { target: { value: W1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: W1 }));
  });

  it('hides the select with a single workspace', () => {
    editor(vi.fn(), workspaces.slice(0, 1));
    expect(screen.queryByLabelText('Workspace')).toBeNull();
  });
});

describe('NoteEditor status switch', () => {
  const editor = (onSubmit: () => void, suggestion: Suggestion, status: Note['status'] = 'draft') =>
    render(
      <NoteEditor
        note={{ ...note(null), status }}
        suggestion={suggestion}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
  const sw = () => screen.getByRole<HTMLInputElement>('switch', { name: 'Track status' });

  it('starts from the suggestion and submits todo when on', () => {
    const onSubmit = vi.fn();
    editor(onSubmit, EMPTY_SUGGESTION);
    expect(sw().checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'todo' }));
  });

  it('submits status null when the suggestion is not actionable, or the switch is turned off', () => {
    const onSubmit = vi.fn();
    editor(onSubmit, { ...EMPTY_SUGGESTION, tracksStatus: false });
    expect(sw().checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ status: null }));
    cleanup();
    const second = vi.fn();
    editor(second, EMPTY_SUGGESTION);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ status: null }));
  });

  it('edit: picking any tracked status saves it in one save', () => {
    const onSubmit = vi.fn();
    editor(onSubmit, EMPTY_SUGGESTION, 'todo');
    fireEvent.change(screen.getByRole('combobox', { name: i18n.t('notes.status.label') }), {
      target: { value: 'done' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
  });

  it('edit: off for a note without status, turning on sends todo', () => {
    const onSubmit = vi.fn();
    editor(onSubmit, EMPTY_SUGGESTION, null);
    expect(sw().checked).toBe(false);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ status: 'todo' }));
  });
});

describe('NoteEditor checklist', () => {
  const withBody = (body: string) => ({ ...note(null), body });
  const renderWith = (body: string) =>
    render(
      <NoteEditor
        note={withBody(body)}
        suggestion={EMPTY_SUGGESTION}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={vi.fn()}
        onCancel={() => undefined}
        onReanalyze={() => new Promise<Suggestion>(() => undefined)}
      />,
    );
  const bodyBox = () => screen.getByLabelText<HTMLTextAreaElement>('Text');

  it('offers Make checklist for two or more lines and converts them on tap', () => {
    renderWith('milk\ncall Dan');
    fireEvent.click(screen.getByRole('button', { name: 'Make checklist (2 items)' }));
    expect(bodyBox().value).toBe('- [ ] milk\n- [ ] call Dan');
  });

  it('hides Make checklist for a single line', () => {
    renderWith('pay rent');
    expect(screen.queryByRole('button', { name: /Make checklist/ })).toBeNull();
  });

  it('hides Make checklist when the body already has items', () => {
    renderWith('- [ ] milk\n- [ ] call Dan');
    expect(screen.queryByRole('button', { name: /Make checklist/ })).toBeNull();
  });

  it('Undo restores the previous body', () => {
    renderWith('milk\ncall Dan');
    fireEvent.click(screen.getByRole('button', { name: 'Make checklist (2 items)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo checklist' }));
    expect(bodyBox().value).toBe('milk\ncall Dan');
  });
});

describe('updated date', () => {
  const open = (n: Note) =>
    render(
      <NoteEditor
        note={n}
        suggestion={EMPTY_SUGGESTION}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={vi.fn()}
        onCancel={() => undefined}
        onReanalyze={() => new Promise<Suggestion>(() => undefined)}
      />,
    );

  it('shows Updated for a note updated on a later day', () => {
    open({
      ...note('x'),
      status: 'todo',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    });
    screen.getByText('Updated Nov 1, 2026');
  });

  it('hides it when updated the same day as created', () => {
    open({
      ...note('x'),
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:30:00Z',
    });
    expect(screen.queryByText(/^Updated/)).toBeNull();
  });

  it('renders the Hebrew label', async () => {
    await i18n.changeLanguage('he');
    open({ ...note('x'), createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' });
    screen.getByText(/^עודכן /);
  });
});

describe('NoteEditor Claude checklist', () => {
  it('offers Claude’s items and applies them only on tap', () => {
    render(
      <NoteEditor
        note={note(null)}
        suggestion={{ ...EMPTY_SUGGESTION, checklist: ['milk', 'Dan', 'bill'] }}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        onReanalyze={() => new Promise<Suggestion>(() => undefined)}
      />,
    );
    const body = () => screen.getByLabelText<HTMLTextAreaElement>('Text');
    expect(body().value).toBe('pay rent');
    fireEvent.click(screen.getByRole('button', { name: 'Make checklist (3 items)' }));
    expect(body().value).toBe('- [ ] milk\n- [ ] Dan\n- [ ] bill');
  });
});

const at = <T,>(list: T[], i: number): T => {
  const v = list[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
};

describe('NoteEditor checklist', () => {
  const withItems = (): Note => ({
    ...note(null),
    checklist: [{ id: '00000000-0000-4000-8000-0000000000a1', text: 'milk', done: false }],
  });

  it('submits the checklist, dropping empty rows', () => {
    const onSubmit = vi.fn();
    render(
      <NoteEditor
        note={withItems()}
        suggestion={EMPTY_SUGGESTION}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={onSubmit}
        onCancel={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.click(at(screen.getAllByRole('checkbox', { name: 'Done' }), 0));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit.mock.calls[0]?.[0].checklist).toEqual([
      { id: '00000000-0000-4000-8000-0000000000a1', text: 'milk', done: true },
    ]);
  });

  it('keeps the checklist on Re-analyze', async () => {
    render(
      <NoteEditor
        note={withItems()}
        suggestion={EMPTY_SUGGESTION}
        taxonomy={{ categories: [] }}
        busy={false}
        failed={false}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        onReanalyze={() => Promise.resolve({ ...EMPTY_SUGGESTION, checklist: ['a', 'b'] })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze' }));
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Re-analyze' }).disabled).toBe(
        false,
      ),
    );
    expect(screen.getAllByLabelText<HTMLInputElement>('Item text').map((i) => i.value)).toEqual([
      'milk',
    ]);
  });
});
