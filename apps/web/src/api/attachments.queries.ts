import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { notesKeys } from './notes.queries';

export const attachmentsKeys = {
  file: (id: string) => ['attachment', id] as const,
  audio: (noteId: string) => ['audio', noteId] as const,
};

/** The object URL lives as long as the cached query, like the audio player's. */
export const useAttachmentFile = (noteId: string, id: string) =>
  useQuery({
    queryKey: attachmentsKeys.file(id),
    queryFn: async () => URL.createObjectURL(await api.attachmentFile(noteId, id)),
    staleTime: Infinity,
    retry: false,
  });

/** One-off download: fetches the bytes and returns a short-lived object URL (revoked after 10s). */
export const useDownloadAttachment = () =>
  useMutation({
    mutationFn: async (v: { noteId: string; id: string }) => {
      const url = URL.createObjectURL(await api.attachmentFile(v.noteId, v.id));
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return url;
    },
  });

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { noteId: string; file: File }) => api.uploadAttachment(v.noteId, v.file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { noteId: string; id: string }) => api.deleteAttachment(v.noteId, v.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

/** A note's recording, fetched only once `enabled`; the object URL lives as long as the cached query. */
export const useNoteAudio = (noteId: string, enabled: boolean) =>
  useQuery({
    queryKey: attachmentsKeys.audio(noteId),
    queryFn: async () => URL.createObjectURL(await api.noteAudio(noteId)),
    enabled,
    staleTime: Infinity,
  });
