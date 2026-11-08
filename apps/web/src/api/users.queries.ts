import type { AddUserBody, AllowedUser } from '@notes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const usersKeys = {
  all: ['users'] as const,
};

export const useUsers = () => useQuery({ queryKey: usersKeys.all, queryFn: () => api.users() });

function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: usersKeys.all });
}

/** `onError` is a hook option, not a `mutate` option, so it fires for every call (TanStack drops per-call callbacks for superseded calls). */
type UsersMutationOptions = { onError?: (err: unknown) => void };

export function useAddUser({ onError }: UsersMutationOptions = {}) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: AddUserBody) => api.addUser(input),
    onSuccess: invalidate,
    onError: (err) => onError?.(err),
  });
}

export function useSetUserAdmin({ onError }: UsersMutationOptions = {}) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (u: AllowedUser) => api.setUserAdmin(u.email, !u.isAdmin),
    onSuccess: invalidate,
    onError: (err) => onError?.(err),
  });
}

export function useRemoveUser({ onError }: UsersMutationOptions = {}) {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (email: string) => api.removeUser(email),
    onSuccess: invalidate,
    onError: (err) => onError?.(err),
  });
}
