import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Note } from '@notes/shared';
import { i18n } from '../../lib/i18n';
import { NoteList } from './NoteList';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

const props = {
  notes: [],
  taxonomy: { categories: [] },
  today: '2026-10-25',
  onOpen: () => {},
  onStatus: () => {},
  hiddenStatuses: [],
};

describe('NoteList', () => {
  it('says there are no notes yet when there are none', () => {
    render(<NoteList {...props} filtered={false} />);
    screen.getByText('No notes yet');
  });

  it('says nothing matches when the filter hides every note', () => {
    render(<NoteList {...props} filtered />);
    screen.getByText('No notes match the filter');
  });

  describe('progressive rendering', () => {
    let trigger: () => void = () => {};
    beforeEach(() => {
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
            trigger = () => cb([{ isIntersecting: true }]);
          }
          observe() {}
          disconnect() {}
        },
      );
    });
    afterEach(() => vi.unstubAllGlobals());
    const make = (n: number): Note[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        clientId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
        title: null,
        body: `note ${i}`,
        status: null,
        workspaceId: '00000000-0000-4000-a000-000000000000',
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
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      }));
    const cards = (c: HTMLElement) => c.querySelectorAll('li:not([aria-hidden])').length;

    it('renders 50 of 200, then 50 more per intersection, with no sentinel at the end', () => {
      const { container } = render(<NoteList {...props} notes={make(200)} filtered={false} />);
      expect(cards(container)).toBe(50);
      expect(container.querySelector('li[aria-hidden]')).not.toBeNull();
      act(() => trigger());
      expect(cards(container)).toBe(100);
      act(() => trigger());
      act(() => trigger());
      expect(cards(container)).toBe(200);
      expect(container.querySelector('li[aria-hidden]')).toBeNull();
    });

    it('goes back to the first 50 when the notes change', () => {
      const { container, rerender } = render(
        <NoteList {...props} notes={make(200)} filtered={false} />,
      );
      act(() => trigger());
      expect(cards(container)).toBe(100);
      rerender(<NoteList {...props} notes={make(120)} filtered={false} />);
      expect(cards(container)).toBe(50);
    });

    it('keeps an expanded card expanded when the notes change but it still matches', () => {
      const all = make(3);
      const { rerender } = render(<NoteList {...props} notes={all} filtered={false} />);
      fireEvent.click(screen.getAllByRole('button', { name: 'Expand' })[1] as HTMLElement);
      expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
      rerender(<NoteList {...props} notes={all.slice(1)} filtered={false} />);
      expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    });
  });
  describe('foldDone', () => {
    const mk = (i: number, status: Note['status']): Note => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      clientId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
      title: null,
      body: `note ${i}`,
      status,
      workspaceId: '00000000-0000-4000-a000-000000000000',
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
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    it('puts done notes behind a closed row with a count, and opens it', () => {
      const notes = [mk(1, 'todo'), mk(2, 'done'), mk(3, 'done')];
      const { rerender } = render(<NoteList {...props} notes={notes} filtered={false} foldDone />);
      screen.getByText('note 1');
      expect(screen.queryByText('note 2')).toBeNull();
      const row = screen.getByRole('button', { name: 'Done (2)' });
      fireEvent.click(row);
      screen.getByText('note 2');
      screen.getByText('note 3');
      rerender(
        <NoteList
          {...props}
          notes={[mk(1, 'todo'), mk(2, 'done'), mk(3, 'done'), mk(4, 'done')]}
          filtered={false}
          foldDone
        />,
      );
      screen.getByRole('button', { name: 'Done (3)' });
    });

    it('stays flat without foldDone or with only done notes', () => {
      const { rerender } = render(
        <NoteList {...props} notes={[mk(1, 'todo'), mk(2, 'done')]} filtered={false} />,
      );
      screen.getByText('note 2');
      rerender(<NoteList {...props} notes={[mk(2, 'done')]} filtered={false} foldDone />);
      screen.getByText('note 2');
      expect(screen.queryByRole('button', { name: /^Done \(/ })).toBeNull();
    });
  });
});
