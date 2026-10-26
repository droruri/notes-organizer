import { EMPTY_SUGGESTION, type Note, type Suggestion } from '@notes/shared';
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
