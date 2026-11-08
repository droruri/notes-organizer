import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../lib/api';
import { useDeleteAttachment, useUploadAttachment } from './attachments.queries';

afterEach(() => vi.restoreAllMocks());

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

describe('attachment mutations', () => {
  it('invalidates the notes list after an upload', async () => {
    vi.spyOn(api, 'uploadAttachment').mockResolvedValue({
      id: 'a1',
      name: 'x.pdf',
      mime: 'application/pdf',
      size: 1,
    } as Awaited<ReturnType<typeof api.uploadAttachment>>);
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useUploadAttachment(), { wrapper });
    act(() => result.current.mutate({ noteId: 'n1', file: new File(['x'], 'x.pdf') }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notes'] }));
  });

  it('invalidates the notes list after a delete', async () => {
    vi.spyOn(api, 'deleteAttachment').mockResolvedValue(undefined);
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useDeleteAttachment(), { wrapper });
    act(() => result.current.mutate({ noteId: 'n1', id: 'a1' }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notes'] }));
  });
});
