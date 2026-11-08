import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { api } from '../lib/api';
import { settingsKeys, useSaveSettings } from './settings.queries';

afterEach(() => vi.restoreAllMocks());

describe('useSaveSettings', () => {
  it('writes the saved settings into the settings cache', async () => {
    const saved = { noteSort: { field: 'createdAt', direction: 'desc' } };
    vi.spyOn(api, 'saveSettings').mockResolvedValue(saved as never);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveSettings(), { wrapper });
    act(() => result.current.mutate({}));
    await waitFor(() => expect(client.getQueryData(settingsKeys.all)).toBe(saved));
  });
});
