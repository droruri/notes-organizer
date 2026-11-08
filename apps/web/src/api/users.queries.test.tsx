import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../lib/api';
import { useAddUser, useRemoveUser, useSetUserAdmin, usersKeys } from './users.queries';

afterEach(() => vi.restoreAllMocks());

const user = { email: 'a@b.co', isAdmin: false, createdAt: '2026-01-01T00:00:00.000Z' };

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

describe('users mutations', () => {
  it('invalidates the users list after a successful add', async () => {
    vi.spyOn(api, 'addUser').mockResolvedValue(user);
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useAddUser(), { wrapper });
    act(() => result.current.mutate(user));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: usersKeys.all }));
  });

  it('invalidates the users list after toggling admin', async () => {
    vi.spyOn(api, 'setUserAdmin').mockResolvedValue({ ...user, isAdmin: true });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSetUserAdmin(), { wrapper });
    act(() => result.current.mutate(user));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: usersKeys.all }));
  });

  it('invalidates the users list after a removal', async () => {
    vi.spyOn(api, 'removeUser').mockResolvedValue(undefined);
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRemoveUser(), { wrapper });
    act(() => result.current.mutate('a@b.co'));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: usersKeys.all }));
  });

  it('hands every failure to the onError option, not only the latest call', async () => {
    vi.spyOn(api, 'removeUser').mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const { wrapper } = setup();
    const { result } = renderHook(() => useRemoveUser({ onError }), { wrapper });
    act(() => result.current.mutate('a@b.co'));
    act(() => result.current.mutate('c@d.co'));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
  });
});
