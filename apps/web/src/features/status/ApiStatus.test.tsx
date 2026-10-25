import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import '../../lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiStatus } from './ApiStatus';

function renderStatus() {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ApiStatus', () => {
  it('says the server is up when /health answers ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true })));
    renderStatus();
    expect(await screen.findByText('השרת פועל')).toBeTruthy();
  });

  it('says the server is down when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderStatus();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
