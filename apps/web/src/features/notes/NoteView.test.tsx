import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Note, Taxonomy } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { NoteView } from './NoteView';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

const TAG = '00000000-0000-4000-8000-0000000000a1';
const CATEGORY_ID = '00000000-0000-4000-8000-000000000001';
const taxonomy: Taxonomy = {
  categories: [
    {
      id: CATEGORY_ID,
      name: 'Home',
      deleted: false,
      importance: null,
      color: 'blue',
      pinned: false,
      tags: [{ id: TAG, categoryId: CATEGORY_ID, name: 'garden', deleted: false }],
    },
  ],
};
const note = (o: Partial<Note> = {}): Note => ({
  id: '00000000-0000-4000-8000-000000000001',
  clientId: '00000000-0000-4000-8000-100000000001',
  title: 'Plan',
  body: 'water plants https://example.com',
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
  tagIds: [TAG],
  hasAudio: false,
  attachments: [],
  checklist: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...o,
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const view = (n: Note, onEdit = vi.fn()) =>
  wrap(<NoteView note={n} taxonomy={taxonomy} onBack={vi.fn()} onEdit={onEdit} />);

describe('NoteView', () => {
  it('is read-only and Edit calls onEdit', () => {
    const onEdit = vi.fn();
    view(note(), onEdit);
    expect(screen.getByText('Plan')).toBeTruthy();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('renders body URLs as new-tab links with surrounding text', () => {
    view(note({ body: 'ראה https://lnkd.in/p/dZ2Xfdma.' }));
    const a = screen.getByRole('link', { name: 'https://lnkd.in/p/dZ2Xfdma' });
    expect(a.getAttribute('href')).toBe('https://lnkd.in/p/dZ2Xfdma');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.parentElement?.textContent).toBe('ראה https://lnkd.in/p/dZ2Xfdma.');
  });

  it('shows tags and body, and hides unset fields', () => {
    view(note());
    expect(screen.getByText('garden')).toBeTruthy();
    expect(screen.getByText(/water plants/)).toBeTruthy();
    expect(screen.queryByText('Due date')).toBeNull();
    expect(screen.queryByText('Workspace')).toBeNull();
  });

  it('shows attachments and unread links', () => {
    view(
      note({
        attachments: [
          {
            id: '00000000-0000-4000-8000-0000000000b1',
            name: 'scan.pdf',
            mime: 'application/pdf',
            size: 1024,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        unreadLinks: ['https://example.com/read'],
      }),
    );
    expect(screen.getByText('scan.pdf')).toBeTruthy();
    expect(screen.getByTitle('https://example.com/read').getAttribute('href')).toBe(
      'https://example.com/read',
    );
  });

  it('shows set fields', () => {
    wrap(
      <NoteView
        note={note({ dueDate: '2026-05-01', importance: 'important' })}
        taxonomy={taxonomy}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        workspaceName="Personal"
      />,
    );
    expect(screen.getByText('Due date')).toBeTruthy();
    expect(screen.getByText('Personal')).toBeTruthy();
  });

  describe('checklist', () => {
    const A = '00000000-0000-4000-8000-0000000000c1';
    const B = '00000000-0000-4000-8000-0000000000c2';
    const list = [
      { id: A, text: 'milk', done: true },
      { id: B, text: 'eggs', done: false },
    ];
    it('shows progress and ticks via onToggleChecklist', () => {
      const onToggle = vi.fn();
      wrap(
        <NoteView
          note={note({ checklist: list })}
          taxonomy={taxonomy}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onToggleChecklist={onToggle}
        />,
      );
      expect(screen.getByText('1/2')).toBeTruthy();
      const boxes = screen.getAllByRole('checkbox');
      expect(boxes).toHaveLength(2);
      const eggs = boxes[1];
      if (!eggs) throw new Error('expected a second checkbox');
      fireEvent.click(eggs);
      expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: note().id }), B);
      expect(screen.getByText('milk').className).toContain('line-through');
    });
    it('renders nothing for an empty list and disables when offline', () => {
      view(note());
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
      cleanup();
      wrap(
        <NoteView
          note={note({ checklist: list })}
          taxonomy={taxonomy}
          onBack={vi.fn()}
          onEdit={vi.fn()}
          onToggleChecklist={vi.fn()}
          checklistDisabled
        />,
      );
      const first = screen.getAllByRole('checkbox')[0];
      expect(first instanceof HTMLInputElement && first.disabled).toBe(true);
    });
  });
});
