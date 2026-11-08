import type { ActionsBody, CategoryColor, Importance } from '@notes/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const taxonomyKeys = {
  all: ['taxonomy'] as const,
};

export const useTaxonomy = () =>
  useQuery({ queryKey: taxonomyKeys.all, queryFn: () => api.taxonomy() });

/** A taxonomy write: runs it, then refetches the taxonomy before settling. */
function useTaxonomyWrite<V, D>(write: (vars: V) => Promise<D>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taxonomyKeys.all }),
  });
}

export const useCreateCategory = () => useTaxonomyWrite((name: string) => api.createCategory(name));
export const useRenameCategory = () =>
  useTaxonomyWrite(({ id, name }: { id: string; name: string }) => api.renameCategory(id, name));
export const useSetCategoryColor = () =>
  useTaxonomyWrite(({ id, color }: { id: string; color: CategoryColor }) =>
    api.setCategoryColor(id, color),
  );
export const useSetCategoryPinned = () =>
  useTaxonomyWrite(({ id, pinned }: { id: string; pinned: boolean }) =>
    api.setCategoryPinned(id, pinned),
  );
export const useSetCategoryImportance = () =>
  useTaxonomyWrite(({ id, importance }: { id: string; importance: Importance | null }) =>
    api.setCategoryImportance(id, importance),
  );
export const useDeleteCategory = () => useTaxonomyWrite((id: string) => api.deleteCategory(id));
export const useRestoreCategory = () => useTaxonomyWrite((id: string) => api.restoreCategory(id));

export const useCreateTag = () =>
  useTaxonomyWrite(({ categoryId, name }: { categoryId: string; name: string }) =>
    api.createTag(categoryId, name),
  );
export const useRenameTag = () =>
  useTaxonomyWrite(({ id, name }: { id: string; name: string }) => api.renameTag(id, name));
export const useDeleteTag = () => useTaxonomyWrite((id: string) => api.deleteTag(id));
export const useRestoreTag = () => useTaxonomyWrite((id: string) => api.restoreTag(id));

/** Applies the agent's taxonomy actions; the caller reads per-action results from the response. */
export const useApplyActions = () =>
  useTaxonomyWrite((body: ActionsBody) => api.applyActions(body));
