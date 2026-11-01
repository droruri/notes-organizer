import type { Workspace } from '@notes/shared';
import { describe, expect, it } from 'vite-plus/test';
import { resolveWorkspace } from './workspaces';

const a: Workspace = { id: '11111111-1111-4111-8111-111111111111', name: 'כללי', isDefault: true };
const b: Workspace = { id: '22222222-2222-4222-8222-222222222222', name: 'ידע', isDefault: false };

describe('resolveWorkspace', () => {
  it('returns the owned workspace with that id', () => {
    expect(resolveWorkspace([a, b], b.id)).toBe(b);
  });
  it('falls back to the default for a missing or unknown id', () => {
    expect(resolveWorkspace([a, b])).toBe(a);
    expect(resolveWorkspace([a, b], '33333333-3333-4333-8333-333333333333')).toBe(a);
  });
  it('is undefined for an empty list', () => {
    expect(resolveWorkspace([])).toBeUndefined();
  });
});
