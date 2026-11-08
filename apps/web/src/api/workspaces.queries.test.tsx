import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Workspace } from '@notes/shared';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../lib/api';
import { useDeleteWorkspace, useEditWorkspace, workspacesKeys } from './workspaces.queries';

afterEach(() => vi.restoreAllMocks());

const ws = (id: string, name: string, isDefault = false): Workspace => ({
  id,
  name,
  isDefault,
  defaultFilter: null,
});

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useEditWorkspace', () => {
  it('patches the saved workspace into the workspaces cache', async () => {
    const saved = ws('b', 'renamed');
    vi.spyOn(api, 'editWorkspace').mockResolvedValue(saved);
    const { client, wrapper } = setup();
    client.setQueryData(workspacesKeys.all, [ws('a', 'A', true), ws('b', 'B')]);
    const { result } = renderHook(() => useEditWorkspace(), { wrapper });
    act(() => result.current.mutate({ id: 'b', patch: { name: 'renamed' } }));
    await waitFor(() =>
      expect(client.getQueryData<Workspace[]>(workspacesKeys.all)?.[1]).toEqual(saved),
    );
  });
});

describe('useDeleteWorkspace', () => {
  it('invalidates both workspaces and notes', async () => {
    vi.spyOn(api, 'deleteWorkspace').mockResolvedValue(undefined as never);
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteWorkspace(), { wrapper });
    act(() => result.current.mutate('b'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const keys = spy.mock.calls.map(([f]) => f?.queryKey);
    expect(keys).toContainEqual(workspacesKeys.all);
    expect(keys).toContainEqual(['notes']);
  });
});
