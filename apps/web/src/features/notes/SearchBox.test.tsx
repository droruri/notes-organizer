import { EMPTY_FILTER, type Note, type NoteFilter, type Taxonomy } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { rankCategories } from './categoryRank';
import { SearchBox } from './SearchBox';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const T1 = '44444444-4444-4444-8444-444444444444';
const taxonomy: Taxonomy = {
  categories: [
    {
      id: C1,
      name: 'לקוחות',
      deleted: false,
      importance: null,
      color: 'blue',
      pinned: false,
      tags: [],
    },
    {
      id: C2,
      name: 'מלקחיים',
      deleted: false,
      importance: null,
      color: 'green',
      pinned: false,
      tags: [{ id: T1, categoryId: C2, name: 'לקוח חדש', deleted: false }],
    },
  ],
};
const notes = [
  {
    id: 'n1',
    title: 'לקוח גדול',
    body: '',
    status: 'open',
    categoryIds: [C1],
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
] as unknown as Note[];
const ranked = rankCategories(notes, taxonomy.categories);
afterEach(cleanup);

function Harness({ onOpenNote }: { onOpenNote?: (id: string) => void }) {
  const [filter, setFilter] = useState<NoteFilter>(EMPTY_FILTER);
  return (
    <>
      <SearchBox
        filter={filter}
        onChange={setFilter}
        taxonomy={taxonomy}
        notes={notes}
        ranked={ranked}
        {...(onOpenNote && { onOpenNote })}
      />
      <output data-testid="state">{JSON.stringify(filter)}</output>
    </>
  );
}
const type = (v: string) =>
  fireEvent.change(screen.getByRole('combobox'), { target: { value: v } });
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '{}') as NoteFilter;

describe('SearchBox', () => {
  it('lists the most used category first', () => {
    render(<Harness />);
    type('לק');
    const options = screen.getAllByRole('option');
    expect(options[0]?.textContent).toContain('לקוחות');
  });

  it('shows nothing below 2 characters', () => {
    render(<Harness />);
    type('ל');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false');
  });

  it('picks the second row with ↓ ↓ Enter, Esc keeps the text', () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    type('לק');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]?.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(state().categoryIds).toEqual([C2]);
    expect(state().text).toBe('');

    type('לק');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(state().text).toBe('לק');
  });

  it('picking a tag adds it and clears the text', () => {
    render(<Harness />);
    type('חדש');
    fireEvent.click(screen.getAllByRole('option')[0] as HTMLElement);
    expect(state().tagIds).toEqual([T1]);
    expect(state().text).toBe('');
  });

  it('picking a note opens it', () => {
    const onOpenNote = vi.fn();
    render(<Harness onOpenNote={onOpenNote} />);
    type('גדול');
    fireEvent.click(screen.getAllByRole('option')[0] as HTMLElement);
    expect(onOpenNote).toHaveBeenCalledWith('n1');
  });

  it('shows the hint when nothing matches', () => {
    render(<Harness />);
    type('zzzz');
    expect(screen.getByText(/Enter יחפש לפי משפט/)).toBeTruthy();
  });
});

describe('SearchBox smart search', () => {
  const renderIt = (onSmartSearch: (t: string) => void, pending = false) =>
    render(
      <SearchBox
        filter={{ ...EMPTY_FILTER, text: 'zzz qqq www' }}
        onChange={() => undefined}
        taxonomy={taxonomy}
        notes={notes}
        ranked={ranked}
        onSmartSearch={onSmartSearch}
        pending={pending}
      />,
    );

  it('runs on Enter with no highlighted row, and ignores IME composition', () => {
    const run = vi.fn();
    renderIt(run);
    const box = screen.getByRole('combobox');
    expect(box.getAttribute('enterkeyhint')).toBe('search');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(run).toHaveBeenCalledWith('zzz qqq www');
  });

  it('does not run twice while pending, and marks the input busy', () => {
    const run = vi.fn();
    renderIt(run, true);
    const box = screen.getByRole('combobox');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(run).not.toHaveBeenCalled();
    expect(box.getAttribute('aria-busy')).toBe('true');
  });
});
