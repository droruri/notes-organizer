import { describe, expect, it } from 'vite-plus/test';
import { EMPTY_FILTER, NoteFilter, SavedFilter } from './noteQuery';
import { WorkspaceEdit } from './workspaces';

describe('NoteFilter / SavedFilter', () => {
  it('accepts the empty filter', () => {
    expect(NoteFilter.safeParse(EMPTY_FILTER).success).toBe(true);
  });
  it('rejects a bad enum, date or uuid', () => {
    expect(NoteFilter.safeParse({ ...EMPTY_FILTER, statuses: ['x'] }).success).toBe(false);
    expect(NoteFilter.safeParse({ ...EMPTY_FILTER, dueFrom: '1/2/2026' }).success).toBe(false);
    expect(NoteFilter.safeParse({ ...EMPTY_FILTER, tagIds: ['x'] }).success).toBe(false);
    expect(NoteFilter.safeParse({ ...EMPTY_FILTER, dueFrom: '2026-02-01' }).success).toBe(true);
  });
  it('SavedFilter drops text', () => {
    const { text: _text, ...rest } = EMPTY_FILTER;
    expect(SavedFilter.parse(EMPTY_FILTER)).toEqual(rest);
  });
  it('WorkspaceEdit accepts a body with only defaultFilter (or null)', () => {
    const { text: _text, ...rest } = EMPTY_FILTER;
    expect(WorkspaceEdit.safeParse({ defaultFilter: rest }).success).toBe(true);
    expect(WorkspaceEdit.safeParse({ defaultFilter: null }).success).toBe(true);
    expect(WorkspaceEdit.safeParse({}).success).toBe(false);
  });
});
