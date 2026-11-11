import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Note } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { TodayList } from './TodayList';
import type { TodayGroups } from './todayGroups';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

const note = (n: number, body: string): Note => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  clientId: `00000000-0000-4000-8000-10000000000${n}`,
  title: null,
  body,
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
  tagIds: [],
  hasAudio: false,
  attachments: [],
  checklist: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const renderList = (groups: TodayGroups, onAllNotes = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TodayList
        groups={groups}
        lang="en"
        onAllNotes={onAllNotes}
        taxonomy={{ categories: [] }}
        today="2026-11-10"
        onOpen={vi.fn()}
        onStatus={vi.fn()}
        hiddenStatuses={[]}
      />
    </QueryClientProvider>,
  );

describe('TodayList', () => {
  it('renders only non-empty sections, with counts', () => {
    renderList({
      overdue: [note(1, 'late a'), note(2, 'late b')],
      dueToday: [],
      inProgress: [note(3, 'working')],
      upcoming: [{ date: '2026-11-12', notes: [note(4, 'soon')] }],
      noDate: [],
    });
    screen.getByRole('heading', { name: 'Overdue (2)' });
    screen.getByRole('heading', { name: 'In progress (1)' });
    screen.getByRole('heading', { name: 'Next 7 days' });
    screen.getByRole('heading', { name: /Nov 12, 2026 \(1\)/ });
    expect(screen.queryByRole('heading', { name: /Due today/ })).toBeNull();
  });

  it('shows the empty state and its button calls the handler', () => {
    const onAllNotes = vi.fn();
    renderList({ overdue: [], dueToday: [], inProgress: [], upcoming: [], noDate: [] }, onAllNotes);
    screen.getByText('Nothing due. Enjoy the quiet.');
    fireEvent.click(screen.getByRole('button', { name: 'All notes' }));
    expect(onAllNotes).toHaveBeenCalledTimes(1);
  });

  it('shows a closed no-date row instead of the empty state, and opens it', () => {
    renderList({
      overdue: [],
      dueToday: [],
      inProgress: [],
      upcoming: [],
      noDate: [note(5, 'someday')],
    });
    expect(screen.queryByText('Nothing due. Enjoy the quiet.')).toBeNull();
    const row = screen.getByRole('button', { name: /To do, no date \(1\)/ });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('someday')).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    screen.getByText('someday');
  });
});
