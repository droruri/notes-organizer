import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { DEFAULT_NOTE_FORM, DEFAULT_QUICK_ACTIONS, type Settings } from '@notes/shared';
import { api } from '../lib/api';
import { settingsKeys, useSaveSettings } from './settings.queries';

afterEach(() => vi.restoreAllMocks());

describe('useSaveSettings', () => {
  it('writes the saved settings into the settings cache', async () => {
    const saved: Settings = {
      noteSort: 'newest',
      noteForm: DEFAULT_NOTE_FORM,
      quickActions: DEFAULT_QUICK_ACTIONS,
    };
    vi.spyOn(api, 'saveSettings').mockResolvedValue(saved);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveSettings(), { wrapper });
    act(() => result.current.mutate({}));
    await waitFor(() => expect(client.getQueryData(settingsKeys.all)).toBe(saved));
  });
});
