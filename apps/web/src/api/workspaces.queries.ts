import type { Workspace, WorkspaceEdit } from '@notes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { notesKeys } from './notes.queries';

export const workspacesKeys = {
  all: ['workspaces'] as const,
};

export const useWorkspaces = () =>
  useQuery({ queryKey: workspacesKeys.all, queryFn: () => api.workspaces() });

export function useCreateWorkspace({ onSuccess }: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createWorkspace(name),
    onSuccess: async () => {
      onSuccess?.();
      await queryClient.invalidateQueries({ queryKey: workspacesKeys.all });
    },
  });
}

/** Patches the saved workspace into the cache, and refetches when the default changed (it flips another row too). */
export function useEditWorkspace({ onSuccess }: { onSuccess?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WorkspaceEdit }) =>
      api.editWorkspace(id, patch),
    onSuccess: async (saved, { patch }) => {
      queryClient.setQueryData<Workspace[]>(workspacesKeys.all, (list) =>
        list?.map((w) => (w.id === saved.id ? saved : w)),
      );
      onSuccess?.();
      if (patch.isDefault) await queryClient.invalidateQueries({ queryKey: workspacesKeys.all });
    },
  });
}

/** Notes move to the default workspace on delete, so the notes list is invalidated too. */
export function useDeleteWorkspace({ onSuccess }: { onSuccess?: (id: string) => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteWorkspace(id),
    onSuccess: async (_, id) => {
      onSuccess?.(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: workspacesKeys.all }),
        queryClient.invalidateQueries({ queryKey: notesKeys.all }),
      ]);
    },
  });
}
