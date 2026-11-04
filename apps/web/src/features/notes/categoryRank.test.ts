import type { Category, Note } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { rankCategories } from './categoryRank';

const cat = (id: string, name: string, deleted = false): Category => ({
  id,
  name,
  deleted,
  importance: null,
  color: 'blue',
});
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const note = (categoryIds: string[], updatedAt: string, status: Note['status'] = 'todo'): Note => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  clientId: '00000000-0000-4000-8000-0000000000bb',
  title: null,
  body: '',
  status,
  workspaceId: WORKSPACE_ID,
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds,
  tagIds: [],
  hasAudio: false,
  attachments: [],
  createdAt: updatedAt,
  updatedAt,
});

describe('rankCategories', () => {
  const a = cat('a', 'Alpha');
  const b = cat('b', 'Beta');
  const c = cat('c', 'Gamma');
  it('puts the most recently edited category first, empty ones last', () => {
    const r = rankCategories(
      [note(['a'], '2026-10-01T00:00:00Z'), note(['b'], '2026-11-04T00:00:00Z')],
      [a, c, b],
    );
    expect(r.map((x) => x.category.id)).toEqual(['b', 'a', 'c']);
  });
  it('breaks ties by count then name and counts only open notes', () => {
    const t = '2026-11-01T00:00:00Z';
    const r = rankCategories(
      [note(['a'], t), note(['b'], t), note(['b'], t), note(['b'], t, 'done')],
      [a, b],
    );
    expect(r.map((x) => [x.category.id, x.count])).toEqual([
      ['b', 2],
      ['a', 1],
    ]);
    expect(rankCategories([], [b, a]).map((x) => x.category.id)).toEqual(['a', 'b']);
  });
  it('skips deleted categories', () => {
    expect(rankCategories([note(['a'], '2026-11-01T00:00:00Z')], [cat('a', 'A', true)])).toEqual(
      [],
    );
  });
});
