import { describe, expect, it } from 'vite-plus/test';
import { EMPTY_FILTER } from './noteQuery';
import { WorkspaceEdit } from './workspaces';

describe('WorkspaceEdit', () => {
  it('accepts a body with only defaultFilter (or null)', () => {
    const { text: _text, ...rest } = EMPTY_FILTER;
    expect(WorkspaceEdit.safeParse({ defaultFilter: rest }).success).toBe(true);
    expect(WorkspaceEdit.safeParse({ defaultFilter: null }).success).toBe(true);
    expect(WorkspaceEdit.safeParse({}).success).toBe(false);
  });
});
