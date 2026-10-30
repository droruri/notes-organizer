import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EMPTY_SUGGESTION, type Note, type Suggestion, type Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { NoteEditor } from './NoteEditor';

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
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
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
        tags: [{ id: TAG, categoryId: HI, name: 'Urgent', deleted: false }],
      },
      {
        id: LO,
        name: 'Home',
        deleted: false,
        importance: 'not_important',
        color: 'slate' as const,
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
