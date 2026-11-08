import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Note, NoteEdit, NoteStatus } from '@notes/shared';
import { api } from '../lib/api';
import { syncNotes } from '../lib/noteStore';
import { taxonomyKeys } from './taxonomy.queries';

export const notesKeys = {
  all: ['notes'] as const,
};

/** The notes list, synced incrementally from what is already cached (first paint: IndexedDB). */
export function useNotes() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: notesKeys.all,
    queryFn: () => syncNotes(queryClient.getQueryData<Note[]>(notesKeys.all)),
  });
}

const invalidateNotes = (qc: QueryClient) => qc.invalidateQueries({ queryKey: notesKeys.all });
const invalidateTaxonomy = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: taxonomyKeys.all });
const invalidateBoth = (qc: QueryClient) =>
  Promise.all([invalidateNotes(qc), invalidateTaxonomy(qc)]);

/** Replace one note in the cache with the server's copy. */
const patchNote = (qc: QueryClient, saved: Note) =>
  qc.setQueryData<Note[]>(notesKeys.all, (old) => old?.map((n) => (n.id === saved.id ? saved : n)));

/** A new note is a draft with fresh suggestions, which may add taxonomy. */
export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.createNote>[0]) => api.createNote(input),
    onSuccess: () => invalidateTaxonomy(queryClient),
  });
}

export function useCreateVoiceNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { audio: Blob; meta: Parameters<typeof api.createVoiceNote>[1] }) =>
      api.createVoiceNote(v.audio, v.meta),
    onSuccess: () => invalidateTaxonomy(queryClient),
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; edit: NoteEdit }) => api.updateNote(v.id, v.edit),
    onSuccess: () => invalidateBoth(queryClient),
  });
}

export function useChangeNoteStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: NoteStatus | null }) =>
      api.updateNote(v.id, { status: v.status }),
    onSuccess: async (saved) => {
      patchNote(queryClient, saved);
      await invalidateNotes(queryClient);
    },
  });
}

/** Ticking a checklist item: the body shows the change at once and rolls back on failure. */
export function useToggleNoteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: string }) => api.updateNote(v.id, { body: v.body }),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: notesKeys.all });
      const previous = queryClient.getQueryData<Note[]>(notesKeys.all);
      queryClient.setQueryData<Note[]>(notesKeys.all, (old) =>
        old?.map((n) => (n.id === id ? { ...n, body } : n)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(notesKeys.all, ctx.previous);
    },
    onSuccess: (saved) => patchNote(queryClient, saved),
    onSettled: () => invalidateNotes(queryClient),
  });
}

export function useSnoozeNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; day: string | null; fromUndo?: boolean }) =>
      api.updateNote(v.id, { snoozedUntil: v.day }),
    onSuccess: () => invalidateNotes(queryClient),
  });
}

/** Resolves on delete; the list refresh runs in the background, so callers can leave the editor first. */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => {
      void invalidateNotes(queryClient);
    },
  });
}

export function useRestoreNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreNote(id),
    onSuccess: () => {
      void invalidateNotes(queryClient);
    },
  });
}

/** Fresh suggestions for a stored note; nothing is saved. */
export function useAnalyzeNote() {
  return useMutation({
    mutationFn: (v: { id: string; input: Parameters<typeof api.analyzeNote>[1] }) =>
      api.analyzeNote(v.id, v.input),
  });
}

/** Refresh notes and taxonomy after something else (chat actions, an import) changed them. */
export function useRefreshNotes() {
  const queryClient = useQueryClient();
  return () => invalidateBoth(queryClient);
}

/** Smart search: turns a sentence into a note filter; nothing is cached. */
export function useFilterFromText() {
  return useMutation({
    mutationFn: (input: Parameters<typeof api.filterFromText>[0]) => api.filterFromText(input),
  });
}
