import type { ImportAnalyze, ImportConfirm, ImportCreated, ImportProposal } from '@notes/shared';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

export const useAnalyzeImport = ({ onSuccess }: { onSuccess?: (p: ImportProposal) => void } = {}) =>
  useMutation({
    mutationFn: (input: ImportAnalyze) => api.analyzeImport(input),
    onSuccess: (p) => onSuccess?.(p),
  });

export const useConfirmImport = ({
  onSuccess,
}: { onSuccess?: (done: ImportCreated, body: ImportConfirm) => void } = {}) =>
  useMutation({
    mutationFn: (input: ImportConfirm) => api.confirmImport(input),
    onSuccess: (done, body) => onSuccess?.(done, body),
  });
