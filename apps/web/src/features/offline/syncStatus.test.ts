import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Note } from '@notes/shared';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { ApiNetworkError } from '../../lib/api';
import { diffNotes, useNotesSync, watchNotesSync } from './syncStatus';

const n = (id: string, updatedAt = 't1') => ({ id, updatedAt }) as Note;

describe('diffNotes', () => {
  it('reports added, changed and removed; ignores unchanged', () => {
    const before = [n('a'), n('b'), n('c')];
    const after = [n('a'), n('b', 't2'), n('d')];
    expect(diffNotes(before, after)).toEqual({ changedIds: ['b', 'd'], removed: 1 });
  });
  it('counts everything as new when before is undefined', () => {
    expect(diffNotes(undefined, [n('a'), n('b')])).toEqual({ changedIds: ['a', 'b'], removed: 0 });
  });
  it('is empty when nothing changed', () => {
    expect(diffNotes([n('a')], [n('a')])).toEqual({ changedIds: [], removed: 0 });
  });
});

describe('watchNotesSync', () => {
  let stop = () => {};
  afterEach(() => {
    stop();
    cleanup();
  });
  const setup = () => {
    const qc = new QueryClient();
    stop = watchNotesSync(qc);
    const hook = renderHook(() => useNotesSync());
    return { qc, hook };
  };
  const refetch = (qc: QueryClient, fn: () => Promise<Note[]>) =>
    qc.fetchQuery({ queryKey: ['notes'], queryFn: fn, staleTime: 0 });

  it('marks a refetch with cached data and no mutation as background, with a result', async () => {
    const { qc, hook } = setup();
    qc.setQueryData(['notes'], [n('a')]);
    let p!: Promise<Note[]>;
    act(() => void (p = refetch(qc, async () => [n('a'), n('b')])));
    expect(hook.result.current).toMatchObject({ fetching: true, background: true });
    await act(async () => void (await p));
    const r = hook.result.current.result;
    expect(r && !r.failed && r.count).toBe(1);
  });

  it('does not mark a refetch during a mutation as background', async () => {
    const { qc, hook } = setup();
    qc.setQueryData(['notes'], [n('a')]);
    void qc
      .getMutationCache()
      .build(qc, { mutationFn: () => new Promise(() => {}) })
      .execute(undefined);
    let p!: Promise<Note[]>;
    act(() => void (p = refetch(qc, async () => [n('a')])));
    expect(hook.result.current.background).toBe(false);
    await act(async () => void (await p));
    expect(hook.result.current.result).toBeUndefined();
  });

  it('gives no result for the first load', async () => {
    const { qc, hook } = setup();
    let p!: Promise<Note[]>;
    act(() => void (p = refetch(qc, async () => [n('a')])));
    expect(hook.result.current.background).toBe(false);
    await act(async () => void (await p));
    expect(hook.result.current.result).toBeUndefined();
  });

  it('reports a failed sync and whether it was a network error', async () => {
    const { qc, hook } = setup();
    qc.setQueryData(['notes'], [n('a')]);
    await act(async () => {
      await refetch(qc, async () => {
        throw new ApiNetworkError('x');
      }).catch(() => undefined);
    });
    expect(hook.result.current.result).toMatchObject({ failed: true, network: true });
  });
});
