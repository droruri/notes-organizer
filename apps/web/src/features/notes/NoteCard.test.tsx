import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Note } from '@notes/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../../lib/api';
import { i18n } from '../../lib/i18n';
import { NoteCard } from './NoteCard';

const CAT = '11111111-1111-4111-8111-111111111111';
const note: Note = {
  id: '22222222-2222-4222-8222-222222222222',
  clientId: '33333333-3333-4333-8333-333333333333',
  title: 'Groceries',
  body: 'milk and eggs https://example.com/a',
  status: 'todo',
  importance: null,
  urgency: null,
  dueDate: '2026-10-30',
  proposed: null,
  unreadLinks: [],
  categoryIds: [CAT],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
};
const taxonomy = {
  categories: [{ id: CAT, name: 'Home', deleted: false, importance: null, tags: [] }],
};

function renderCard(onOpen = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ul>
        <NoteCard note={note} taxonomy={taxonomy} today="2026-10-25" onOpen={onOpen} />
      </ul>
    </QueryClientProvider>,
  );
  return onOpen;
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.spyOn(api, 'linkPreview').mockResolvedValue({
    kind: 'article',
    title: null,
    description: null,
    image: null,
    siteName: null,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('NoteCard collapse', () => {
  it('starts collapsed and toggles with the chevron', () => {
    renderCard();
    screen.getByText('Groceries');
    screen.getByText('To do');
    expect(screen.queryByText(/milk and eggs/)).toBeNull();
    expect(screen.queryByText('Home')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Expand' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    screen.getByText(/milk and eggs/);
    screen.getByText('Home');
    const open = screen.getByRole('button', { name: 'Collapse' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(open);
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('opens the editor from the title without expanding', () => {
    const onOpen = renderCard();
    fireEvent.click(screen.getByText('Groceries'));
    expect(onOpen).toHaveBeenCalledWith(note);
    expect(screen.queryByText('Home')).toBeNull();
  });

  it('makes no link-preview request while collapsed', () => {
    renderCard();
    expect(api.linkPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(api.linkPreview).toHaveBeenCalledWith('https://example.com/a');
  });
});

describe('NoteCard chips', () => {
  it('renders categories and tags with no literal # in the tag text', () => {
    const TAG = '44444444-4444-4444-8444-444444444444';
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ul>
          <NoteCard
            note={{ ...note, tagIds: [TAG] }}
            taxonomy={{
              categories: [
                {
                  id: CAT,
                  name: 'Home',
                  deleted: false,
                  importance: null,
                  tags: [{ id: TAG, categoryId: CAT, name: 'urgent-fix', deleted: false }],
                },
              ],
            }}
            today="2026-10-25"
            onOpen={vi.fn()}
          />
        </ul>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(screen.getByText('Home').className).toContain('cat-pill');
    const tag = screen.getByText('urgent-fix');
    expect(tag.className).toContain('tag-box');
    expect(tag.textContent).not.toContain('#');
  });
});
