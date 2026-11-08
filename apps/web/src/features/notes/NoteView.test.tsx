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
const taxonomy: Taxonomy = {
  categories: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Home',
      tags: [{ id: TAG, name: 'garden' }],
    },
  ],
} as unknown as Taxonomy;
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

  it('shows tags and body, and hides unset fields', () => {
    view(note());
    expect(screen.getByText('garden')).toBeTruthy();
    expect(screen.getByText(/water plants/)).toBeTruthy();
    expect(screen.queryByText('Due date')).toBeNull();
    expect(screen.queryByText('Workspace')).toBeNull();
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
});
