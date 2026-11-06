import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Note } from '@notes/shared';
import { i18n } from '../../lib/i18n';
import { ContinueRow } from './ContinueRow';
import { recordOpen } from './recent';

const TODAY = '2026-10-25';
const note = (i: number, o: Partial<Note> = {}): Note => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  clientId: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
  title: `note ${i}`,
  body: '',
  status: null,
  workspaceId: '00000000-0000-4000-a000-000000000000',
  importance: null,
  urgency: null,
  dueDate: null,
  snoozedUntil: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  ...o,
});
const props = { taxonomy: { categories: [] }, today: TODAY, onOpen: () => {} };

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('ContinueRow', () => {
  it('shows the last opened note first and opens it on tap', () => {
    const notes = [note(1), note(2), note(3)];
    recordOpen(notes[0]?.id ?? '', 1);
    recordOpen(notes[2]?.id ?? '', 2);
    const onOpen = vi.fn();
    render(<ContinueRow {...props} notes={notes} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /note 3/ }));
    expect(onOpen).toHaveBeenCalledWith(notes[2]);
  });

  it('adds overdue notes with a badge and skips deleted recents', () => {
    const overdue = note(1, { dueDate: '2026-10-20', status: 'todo' });
    recordOpen('00000000-0000-4000-8000-0000000000ff', 1);
    render(<ContinueRow {...props} notes={[overdue]} />);
    screen.getByText('note 1');
    screen.getByText('Overdue');
  });

  it('renders due notes when the stored value is corrupt', () => {
    localStorage.setItem('recentNotes', '{bad');
    const spy = vi.spyOn(console, 'error');
    render(<ContinueRow {...props} notes={[note(1, { dueDate: TODAY, status: 'todo' })]} />);
    screen.getByText('note 1');
    expect(spy).not.toHaveBeenCalled();
  });

  it('renders nothing when empty', () => {
    const { container } = render(<ContinueRow {...props} notes={[note(1)]} />);
    expect(container.firstChild).toBeNull();
  });

  it('caps at 8 and expands the rest on mobile', () => {
    const notes = Array.from({ length: 10 }, (_, i) => note(i + 1));
    notes.forEach((n, i) => recordOpen(n.id, i));
    render(<ContinueRow {...props} notes={notes} />);
    expect(screen.getAllByRole('listitem').length).toBe(5);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });
});
