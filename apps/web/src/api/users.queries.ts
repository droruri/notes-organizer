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

export function useAddUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: AddUserBody) => api.addUser(input),
    onSuccess: invalidate,
  });
}

export function useSetUserAdmin() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (u: AllowedUser) => api.setUserAdmin(u.email, !u.isAdmin),
    onSuccess: invalidate,
  });
}

export function useRemoveUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (email: string) => api.removeUser(email),
    onSuccess: invalidate,
  });
}
