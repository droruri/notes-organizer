import { act, cleanup, render, screen } from '@testing-library/react';
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
  });
});
