import type { ImportProposal } from '@notes/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { i18n } from '../../lib/i18n';
import { ImportReview } from './ImportReview';

afterEach(cleanup);

const suggestion = {
  categoryIds: [],
  tagIds: [],
  newCategories: [],
  newTags: [],
  dueDate: null,
  importance: null,
  urgency: null,
  title: null,
  workspaceId: null,
  tracksStatus: true,
  unreadLinks: [],
};
const proposal: ImportProposal = {
  newCategories: ['Home'],
  newTags: [{ categoryName: 'Home', name: 'Chores' }],
  notes: [
    {
      body: 'wash up',
      suggestion: {
        ...suggestion,
        newCategories: ['Home'],
        newTags: [{ categoryName: 'Home', name: 'Chores' }],
      },
    },
    {
      body: 'read https://x.test/a',
      suggestion: { ...suggestion, unreadLinks: ['https://x.test/a'] },
    },
  ],
  links: { total: 47, read: 30 },
};

function show(onConfirm = vi.fn()) {
  void i18n.changeLanguage('en');
  render(
    <ImportReview
      proposal={proposal}
      taxonomy={{ categories: [] }}
      busy={false}
      failed={false}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );
  return onConfirm;
}

describe('ImportReview', () => {
  it('shows the not-read banner and the chip on affected rows', () => {
    show();
    expect(screen.getByRole('status').textContent).toContain(
      'Claude read 30 of 47 links. 1 note has links that were not read.',
    );
    expect(screen.getAllByText('Link not read')).toHaveLength(1);
  });

  it('confirms only the checked items', () => {
    const onConfirm = show();
    fireEvent.click(screen.getByRole('checkbox', { name: 'wash up' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 note' }));
    expect(onConfirm).toHaveBeenCalledWith({
      categories: [],
      tags: [],
      notes: [expect.objectContaining({ body: 'read https://x.test/a', newCategories: [] })],
    });
  });

  it('drops a new tag whose category is unchecked', () => {
    const onConfirm = show();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 notes' }));
    const body = onConfirm.mock.calls[0]?.[0];
    expect(body.categories).toEqual([]);
    expect(body.tags).toEqual([]);
    expect(body.notes[0].newTags).toEqual([]);
  });
});
